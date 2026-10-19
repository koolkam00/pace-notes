# Pace Notes redesign: the final design spec

**Status:** final direction for implementation, written 2026-10-17 by the design lead.
**Codebase:** branch `feat/insights-only` at `1dbab861` (the `/home/user/wt/insights` worktree was removed on 2026-10-17; read it with `git show feat/insights-only:<path>` or check the branch out again). Release `htw-db-2026-10-16-1652` is being adopted in parallel on `feat/release-1652` (`/home/user/wt/data`). Implementation starts from `feat/insights-only` with `feat/release-1652` merged in, or from whichever lands first.
**Inputs:** `inventory.md` (contracts), `critique.md` (live-site problems), `nuggets.md` (data paths and guards), the three concept directions under `concepts/` and the three judgements.
**Reference screenshots:** `final-refs/` in this folder (section 11).

Every number in this document is today's value (release `private-export-20260912-0934`), given as an example. **No page may type a number.** Every figure and every directional word comes from a field through `lib/nuggets/` (section 5), with a guard and a neutral fallback, so the site stays true when the new release lands.

---

## 00. Owner direction, October 17, 2026: simple is beautiful (this section wins every conflict)

The owner wrote: "focus on amazing design, simple is beautiful; you can delete anything you feel is too cluttered, old or doesn't contribute to making this as good and as beautiful as possible." Every package applies this before anything else in the spec. When a section below asks for more than this allows, do less.

**The test for every element.** Does it help a runner learn the page's finding, or act on it? If not, delete it. A cut that makes the page calmer is always allowed and needs no sign-off; record it in the package's report. Deleting code is better than hiding it.

**Hard budgets (they replace the targets in §0 "What changes for a reader" and every package's acceptance).**

| Page | Phone screens (844 px), max | Beats, max |
|---|---|---|
| Home | 4.5 | hero + 3 |
| Story | 6 | 6 |
| Analysis | 4 | 4 (the receipt counts as one) |
| Course page | 7 | its kept sections, each trimmed |
| Tool | 3 above the fold result, 5 total | — |
| Hubs (`/research`, `/courses`, `/tools`) | 4 | — |
| Methodology, details closed | 10 | — |

- **A beat** is one figure or one interaction plus at most two sentences, 45 words in all. The opener is the only beat allowed without a figure. Never more than one control per beat.
- **Body copy** stays within half of today's word count on every page. Kickers, deks and captions earn their place or go. One heading level per beat.
- **Chrome:** one hairline or whitespace between beats, never a box. No more than one badge, one link row and one call to action per screen. No decorative icons, emoji, gradients or illustrations unless they are data (the pixel runners count as data only where they encode finishers).
- **Colour:** ink, paper, one accent (the reading) and the validated data ramp. Nothing else.
- **Type:** if a typeface or weight is used only once or twice, cut it. The fewer, the better.
- **Motion:** only where it explains (the replay, a scrub, a reveal of an answer). No entrance animations on scroll for text.

**Cuts decided now (the default for each owner decision in §9 still stands where not overridden).**
1. **The research-pack archive goes.** `/packs` and every `/packs/[packId]` page (primaries, thin pages and aliases) are removed from the site. Vercel 308s `/packs` and `/packs/:id*` to `/methodology#downloads` (the existing `/packs/smyth_htw` redirect keeps its target). The pack data files in `public/data/packs/**` stay published and downloadable, because analyses read them and AGENTS.md requires public downloads; `/methodology#downloads` links to them and to the GitHub releases. WP8 owns the removal, the stubs (GitHub Pages fallback), the sitemap and every verifier that pinned pack pages (update the pins; never weaken a data or privacy check).
2. **Home is four things:** the night hero with the replay and the plan door (`hero`, `paths`), one guess-first reading (`stakes`), the chapter list as the course line (`guide`), and the closing CTA (`cta`). The "Plan in three steps" section (`steps`) and the eight-card story deck (`stories`, `#research`) are deleted; the chapter list already lists every story with its reading. WP1 updates `verify-analytics` (home section ids) and S6 `HOME_SECTIONS` to the new set; `autopilot/metrics.md` is unaffected (`home_depth@v1` counts `chapter-*`, which home never has).
3. **Hubs become one list each.** `/stories` and `/analyses` are the Contents rows filtered, with no cards, no callouts and no promos; the "Request an analysis" callout lives only on `/about` and in the footer. `/tools` is one list of tools with one line each, grouped into "For your race" and "Reference".
4. **No duplicate paths to the same page on one screen.** Each page links forward once (the next card) and back once.
5. **Footer:** brand line, one row of links, the motion switch. At most 0.4 of a phone screen.
6. **Stories:** every beat that repeats another page's finding is cut; the story keeps its single best scrolly or none. Analyses: the receipt and one explorer; secondary charts go.
7. **Course pages:** keep every pinned section id and its order (contracts), but each section shows its one chart and one sentence; long tables collapse into one "All numbers" disclosure.
8. **The `/design-system` gallery** is deleted in WP9 as planned.

**What stays non-negotiable** (simplicity never overrides these): the repository rules in AGENTS.md (insights only, methods on `/methodology`, evidence badges on tools, no "your chance", never "arithmetic", privacy and masking, groups of 100), the analytics and replay contracts in §6.5 to §6.7 unless this section names a change, and real numbers from data through `lib/nuggets/`.

**The data.** The site now runs on release `htw-db-2026-10-16-1652` (main `77356bf`, PR #70): 4,915,355 records; 3,871,767 eligible finishes from 211 editions in 28 cities; 28 course pages (Melbourne removed). Example numbers in this spec are from 0934; the nuggets read the live fields.

---

## 0. The decisions on one page

**Backbone: Direction C, "Instrument".** It ranked first with two of the three judges (craft 8, feasibility 8) and had the best average (7.7, against A 7.3 and B 6.2). C provides:
- the reading opener;
- one accent colour;
- the needle chart system: readout above the plot, 1:1 thumb tracking, detents, the drag handle below the ticks, lens toggles;
- server-rendered SVG with tiny client islands;
- contents rows that each show their reading;
- the replay drawn in finish-rank lanes;
- the font diet;
- the strictest contract fidelity: the course-page section order, the selectors, no new storage keys or masked classes.

**Grafted from Direction A, "Mile by Mile".**
- Chapters named by race distance (START, 5K, 10K, HALF, 30K, FINISH), grouped in three parts and drawn on a dashed course line in the menu and the contents.
- A reading bar that shows minutes left, with a tick for each beat.
- A sticky step-by-step scrolly for a story's signature finding: at most one per story (round-numbers, pacing-types, who-holds-pace and race-morning use one).
- Guesses drawn on the same marks as the answer.
- On phones, a night home hero that opens on the race replay.
- The five links shown inline on desktop.
- `verify-nuggets.cjs`, with the OG cards built from the same nugget module.
- One elevation height scale on every course page.
- "What makes {city} {city}" on course pages.

**Grafted from Direction B, "Wrapped".**
- The race receipt as the analysis answer.
- The goal translation line ("At 4:00, more than 10% fast is a first 5K under 25:36").
- The "Make it yours" sheet, which carries the full set of filters the S2 test pins.
- The rule that **you are an orange ring, never a filled or ramp colour**.
- The 4:5 share card.
- The home story deck.
- Bricolage hero figures, which bring back warmth.
- The re-stepped pacing-type colours: fast-start fader moves off orange.

**Rejected on purpose.**
- B's always-on dock, 100svh cards and twelve chapter colour fields.
- B's goal pinned to every page through a new storage key and a new masked class.
- C's "All laps" rename, its monochrome-only pacing types and C's dial.
- A's single token meaning both "you" and "slower".
- A's boxed-card stacks and per-chapter bespoke scrollies.

**Every problem a judge raised has a fix**, listed in section 12.

### What changes for a reader

1. The site reads as one marathon: a prologue (home), then **11 chapters in three parts**. Each chapter is a stretch of the race with its own lead number. Every page opens on its finding and ends on the next chapter's number.
2. Every page leads with **the reading**: one big figure, one sentence and a small instrument. Analyses open on their answer. A form never comes first, and no page has an empty state.
3. Every chart with a continuous axis can be **scrubbed with a thumb**. A story has **at most one** step-by-step reveal, and a page has **at most one** guess-first moment.
4. Methodology lives only on `/methodology`. Each page has one quiet "How we know ↗" link.
5. Pages get much shorter on a phone. These are targets, in screens of 844 px:

   | Page | Target | Today |
   |---|---|---|
   | Home | 6 | 7.7 |
   | Story | 9 | 9–17.5 |
   | Analysis | 6 | 3–11, mostly empty |
   | Course | 9 | 15–20 |
   | Methodology, on first read with details closed | 14 | 67.7 |

---

## 1. Principles

1. **Lead with the reading.** A page opens on one figure, one plain sentence that says what it means, and a small instrument that shows where it sits. Depth comes after and stays optional: another beat, a tap to compare, the Values table.
2. **One idea per beat, one interaction per beat.** A beat is one claim, one figure and at most one control. If a figure needs a paragraph to explain it, the figure is wrong.
3. **Orange is the reading; a ring is you.**
   - A filled signal-orange mark is the one thing the sentence is about.
   - The reader's own guess, goal or time is an orange **ring** with a "You" label.
   - Everything else is ink, quiet grey or a validated data colour.
   - "Slower" is never orange. It is position and sign, or the crimson end of the heatmap ramp.
4. **Touch the data.**
   - A horizontal drag scrubs and a vertical drag scrolls.
   - The needle follows the thumb 1:1 and snaps at values that matter.
   - The readout above the plot is the tooltip, so nothing hides under a finger.
5. **Night is the race and the answer.** Dark surfaces mean one of two things:
   - the race: the replay, the course hero and the home hero;
   - the answer: the analysis receipt, the result card and the next-chapter card.

   They are never used for forms, captions or promos.
6. **Read it like a race.** Chapters are stretches of the course. A reading bar shows how much of the page is left, and every page ends on a forward card. Nobody is dropped at a footer.
7. **Insights only, honest by construction.**
   - Every headline is a guarded nugget.
   - A null result looks null.
   - One sentence uses one denominator.
   - Shares are "of finishes", never "your chance".
   - Groups need at least 100 finishes.
8. **Quiet chrome, no box inside a box.**
   - A page has one surface level, plus one raised surface where one is needed: a sheet, a receipt, the guess panel, the next card or a share card.
   - Beats are separated by whitespace and hairlines, not cards.
   - The closing stack fits in one phone screen and the footer in about 0.6 of one.

---

## 2. Information architecture

### 2.1 Every route and its fate

**Fates:**
- **Keep:** URL and template unchanged; only the shared shell restyles it.
- **Restyle:** same URL, rebuilt on the new templates.
- **Merge:** its content moves into another page; the URL becomes a legacy stub plus a 308.
- **New:** a page that does not exist today.
- **Stub:** a noindex "this page has moved" page that forwards in the browser. It stays only for the GitHub Pages fallback, because Vercel serves the 308 first.

| Route | Kind | Chapter, page | Fate | What happens |
|---|---|---|---|---|
| `/` | hub | Prologue | Restyle | The start line. Replay-first night hero, a guess, the contents course line, the story deck and the CTA. The pinned section ids are unchanged (§2.7) |
| `/research` | hub | Contents | Restyle | **Contents**: every chapter and every page, each with its reading. It keeps its URL, the "Research" menu label, `#analyses` and the orphans rule |
| `/stories` | hub | — | Restyle | The contents filtered to stories, shown as nugget cards. It keeps its canonical URL |
| `/analyses` | hub | — | Restyle | The contents filtered to analyses, plus the Request an analysis callout |
| `/finish-times` | chapter | 01 START, page 1 | Restyle | Leads the field chapter. It gains "the front moved, the back didn't" from `/stories/courses#years` and a ranked median-by-course strip |
| `/stories/race-replay` | story | 01, page 2 | Restyle | The `#snapshots` beat is cut; the replay scrubber replaces it |
| `/analyses/starting-pace` | analysis | 02 5K, page 1 | Restyle and absorb | Absorbs `/stories/final-kick#bank` (the matched bank-and-pay result becomes the H1 and the receipt) |
| `/analyses/downhill-start` | analysis | 02, page 2 | Restyle | |
| `/stories/pacing-types` | story | 03 10K, page 1 | Restyle | |
| `/analyses/pacing-pattern` | analysis | 03, page 2 | Restyle | |
| `/analyses/checkpoint` | analysis | 04 HALF, page 1 | Restyle | It now shows a full default answer (30K, even 4:00 pace) instead of an empty state |
| `/stories/places` | story | 04, page 2 | Restyle | Copy is cut from 1,945 words to about 900 |
| `/tools/projector` | tool | 04, page 3 | Restyle | |
| `/slowdown` | explainer | 05 30K, page 1 | Restyle | Becomes the explainer that opens the chapter. The landmarks figure is removed; round numbers live only in `/stories/round-numbers` |
| `/stories/final-kick` | story | 05, page 2 | Restyle and reorder | Beats now run in race order. `#bank` moves to starting-pace and `#follows` to finding-improvement. The title is rebuilt from the twins nugget |
| `/analyses/where-time-is-gained` | analysis | 05, page 3 | Restyle | |
| `/stories/round-numbers` | story | 06 FINISH, page 1 | Restyle | |
| `/analyses/finish-time-context` | analysis | 06, page 2 | Restyle | The "where does your target sit" explorer. It stays a route: `TEN_ANALYSES` stays 10, and S2 and `verify-runner-search` pin it |
| `/stories/who-holds-pace` | story | 07, page 1 | Restyle | The 15 sparkline cards become one slope chart |
| `/analyses/age-and-pacing` | analysis | 07, page 2 | Restyle | |
| `/stories/courses` | story | 08, page 1 | Restyle and split | `#weather` and `#heat` move to `/stories/race-morning`, and `#years` moves to `/finish-times` |
| `/analyses/course-comparison` | analysis | 08, page 2 | Restyle | |
| `/analyses/hills-and-pacing` | analysis | 08, page 3 | Restyle | It defaults to the course picked by data, with no empty state |
| `/courses` | course index | 08, page 4 | Restyle | Compact rows with sort chips, not 29 big cards |
| `/courses/[city]` ×29 (34 in the new release) | course | 08, children | Restyle | Section order, ids and tracking are kept exactly |
| `/stories/race-morning` | story | 09, page 1 | **New** | The weather half of `/stories/courses` |
| `/analyses/race-day-weather` | analysis | 09, page 2 | Restyle and absorb | Three tabs: Start temperature, Warming and Wind |
| `/analyses/warming-and-pacing` | — | — | Merge, then stub + 308 | 308 to `/analyses/race-day-weather#warming` |
| `/analyses/wind-and-pacing` | — | — | Merge, then stub + 308 | 308 to `/analyses/race-day-weather#wind` |
| `/tools/weather-match` | tool | 09, page 3 | Restyle | |
| `/runners` | runner | 10, page 1 | Restyle | Noindex and never recorded, as today |
| `/tools/split-check` | tool | 10, page 2 | Restyle | |
| `/report` | report | 10, off-chain | Restyle | Reached from runners and split check only |
| `/analyses/finding-improvement` | analysis | 11, page 1 | Restyle and absorb | Absorbs `final-kick#follows` (recurrence) and the race-spacing nugget |
| `/tools/plan` | tool | 11, page 2 | Restyle | **The finish line of the reading journey** |
| `/tools/pace-band`, `/tools/course-chooser`, `/tools/predictor` | tool | 11, "also in this chapter" | Restyle | The course chooser defaults to sorting by the share under the goal |
| `/tools` | tool index | Reference | Restyle | Per-tool hues are removed |
| `/tools/pace-calculator` | tool | Reference | Restyle | |
| `/tools/qualifying` | tool | Reference | Restyle | |
| `/tools/qualifying/[race]` ×6 | tool, search | Reference | Restyle | The cut-off history becomes a lollipop timeline |
| `/tools/marathon-pace-chart`, `/tools/half-marathon-pace-chart` | tool | Reference | Restyle | |
| `/tools/marathon-pace/[goal]` ×5 | tool, search | Reference | Restyle | "The pile-up before {goal}" moves to the second card |
| `/methodology` | info | Reference | Restyle | Jump sheet and rail. Its units switch now works |
| `/about` | info | Reference | Restyle | Short and personal. All data-source copy moves to methodology |
| `/privacy` | info | Reference | Keep | Prose template |
| `/request-analysis` | info | Reference | Keep | Prose and form template |
| `/packs` | archive | Reference | Keep | Linked from `/methodology#archive` and the contents' reference block |
| `/packs/[packId]`, primary ×33, plus 6 thin (noindex) | archive | Reference | Keep | Restyled through the shared primitives only |
| `/packs/[packId]`, alias ×45 | archive | — | Stub + 308 | 308 to the primary pack that each alias already names as canonical |
| `/research/personalized` | — | — | Merge, then stub + 308 | 308 to `/research`. The stub forwards `#guide-*` hashes to the matching analysis using the existing `LegacyAnalysisLink` map |
| `/your-race`, `/htw`, `/packs/smyth_htw` | legacy | — | Keep | The existing stubs and 308s |
| `/404`, `app/error.tsx`, `app/global-error.tsx` | info | — | Keep | Restyled. The headings are pinned by autopilot-smoke |
| `robots.txt`, `sitemap.xml`, `manifest.webmanifest` | meta | — | Keep | The sitemap drops the merged and alias routes and adds `/stories/race-morning` |

### 2.2 The reading flow: a prologue, then 11 chapters in three parts

This is the twelve-stop order from `nuggets.md`, grouped by Direction A. Part one follows the race clock, so its chapters carry race-distance markers. Parts two and three use their numbers as markers.

| # | Marker | Chapter | Pages, in order (the "next" chain) | Also in this chapter | Lead reading on the contents row | Its data and guard |
|---|---|---|---|---|---|---|
| — | — | **The start line** (prologue) | `/` | — | — | — |
| **Part one** | | **The race** | | | | |
| 01 | START | **The field** | `/finish-times` → `/stories/race-replay` | — | **4:10**, "median finish" | `finish-times.json` nearest-rank median (`getFinishTimeSummary().groups.all.median`) |
| 02 | 5K | **The first 5K** | `/analyses/starting-pace` → `/analyses/downhill-start` | — | **+5:00**, "at the finish, after a first 5K over 10% fast" | `kick.bank.bands[label='More than 10% faster'].finish_s`; guard `open_s < 0 && finish_s > 0` |
| 03 | 10K | **The shape of a race** | `/stories/pacing-types` → `/analyses/pacing-pattern` | — | **1 in 25**, "ran their second 20K faster than their first" | `packs/ext_pacing_shapes/tables/patterns.csv`, label `Faster second 20 km`; `inWords()` |
| 04 | HALF | **Halfway to 30K** | `/analyses/checkpoint` → `/stories/places` → `/tools/projector` | — | **13%**, "on even 4:00 pace at 30K got under 4:00" | Checkpoint shard row for 30K at even 4:00 pace; guard share < 0.5 |
| 05 | 30K | **After 30K** | `/slowdown` → `/stories/final-kick` → `/analyses/where-time-is-gained` | — | **72%**, "of sustained slowdowns began at 30K or later" | `study.timing.charts[0].rows` for labels 30 and 35 |
| 06 | FINISH | **The finish line** | `/stories/round-numbers` → `/analyses/finish-time-context` | `/tools/marathon-pace/[goal]` | **3:58**, "the busiest finishing minute" | `argmax(finish-times.histogram, all).minute` |
| **Part two** | | **The runner and the road** | | | | |
| 07 | 07 | **Who holds pace** | `/stories/who-holds-pace` → `/analyses/age-and-pacing` | — | **20% · 45%**, "sustained slowdown, women · men, at the same finish times" | `demographics.overall.women_slowdown`, `.men_slowdown`; guard men > women |
| 08 | 08 | **Where you run** | `/stories/courses` → `/analyses/course-comparison` → `/analyses/hills-and-pacing` → `/courses` | The `/courses/[city]` pages | **19–46%**, "sustained slowdown, across courses" | Min and max of the all-finisher `courses[].slowdown_pct`, filtered `n ≥ 100` and `editions ≥ 3`; guard max/min > 1.5 |
| 09 | 09 | **The weather** | `/stories/race-morning` → `/analyses/race-day-weather` → `/tools/weather-match` | — | **197 of 225**, "same-course pairs: the warmer year had more sustained slowdowns" | `courses.weather.pairs.hotter_slowed_more` / `.total`; guard majority |
| **Part three** | | **Your race** | | | | |
| 10 | 10 | **Your race** | `/runners` → `/tools/split-check` | `/report` | **Yours**, "nine mats, one race" | No data value |
| 11 | 11 | **The next one** | `/analyses/finding-improvement` → `/tools/plan` | `/tools/pace-band`, `/tools/course-chooser`, `/tools/predictor` | **51%**, "of next races had one too, after a sustained slowdown (34% typical)" | `kick.recurrence.after_slowdown.observed`, `.expected`; guard observed > expected |

**Exact copy for the contents keys.** The keys above are the approved wording, and each must be reproduced exactly. They replace these misstatements the judges caught:
- "42% still won" → it is "still crossed first".
- "51% came back" → it means the slowdown recurred.
- "88% warmer slowed" → it is "warmer year, more sustained slowdowns".
- "1 in 25 faster 2nd half" → it is the second 20K.
- "began at the 20K mat" → it is "began in the 20–25K section".

Keys are Inter 13 px in sentence case, never mono caps, and may wrap to two lines.

**Reference pages, outside the race** (no next chain): `/methodology`, `/about`, `/privacy`, `/request-analysis`, `/tools`, `/tools/pace-calculator`, `/tools/qualifying*`, the two pace charts, `/packs`.

**Why this order.** It follows the clock and answers the question each chapter raises:
- Most finishes slow. When does it start? (Chapter 05)
- Who holds pace? (07)
- Where and in what weather? (08 and 09)
- What about my race? (10)
- Plan the next one. (11)

The planner is the journey's finish line, and it stays door 1 on the home page.

### 2.3 The chapter registry: `lib/chapters.ts` (new; owned by WP0-B)

The header, the menu sheet, `/research`, `/stories`, `/analyses`, the home guide, the rail, the reading bar and every next card all read this one file. It holds no numbers: readings are nugget ids that the server resolves at build.

```ts
export type Marker = 'START' | '5K' | '10K' | 'HALF' | '30K' | 'FINISH' | '07' | '08' | '09' | '10' | '11';
export type PageKind = 'story' | 'analysis' | 'explainer' | 'tool' | 'course-index' | 'runner' | 'report';
export type ChapterPage = {
  href: string;                // canonical path, no query
  kind: PageKind;
  short: string;               // ≤ 28 chars, for the rail, the reading bar and "← previous"
  title: string;               // the page's display title (stories: lib/stories.ts getter)
  nugget: NuggetId;            // the page's reading (lib/nuggets), shown in contents sub-rows and next cards
  howWeKnow: `/methodology#${string}`; // must resolve (verify-seo methods-anchors)
};
export type Chapter = {
  n: number; id: string; part: 1 | 2 | 3; marker: Marker;
  title: string; subtitle: string;      // subtitle names the pages ("Finish times, the replay")
  pages: ChapterPage[];                  // the next chain, in order
  also?: { href: string; label: string }[]; // off-chain pages in the chapter
  lead: NuggetId;                        // the contents-row reading (= pages[0].nugget unless stated)
  key: string;                           // the approved key text from §2.2
};
export const CHAPTERS: readonly Chapter[];
export function placeOf(path: string): { chapter: Chapter; index: number } | { chapter: Chapter; child: true } | null;
export function nextOf(path: string): ChapterPage | Chapter | null;   // last page of chapter → next chapter's first page
export function prevOf(path: string): ChapterPage | null;
```

- `/courses/[city]` resolves to chapter 08 as a child. Its next card goes to chapter 09.
- `/report` resolves to chapter 10 as a child.
- `/tools/plan` returns `null` from `nextOf`, which shows the finish card (§2.6).

**`howWeKnow` anchors.** These exist today. WP7 adds `#story-race-morning` and `#archive`.

| Pages | Anchor |
|---|---|
| `/finish-times` | `#finish-times` |
| `/stories/<slug>` | `#story-<slug>` |
| `/analyses/starting-pace` | `#fast-start-method` |
| `/analyses/course-comparison`, `/analyses/race-day-weather`, `/analyses/downhill-start` | `#all-finisher-context` |
| The other analyses | `#question-methods` |
| `/slowdown` | `#slowdown-method` |
| `/courses`, `/courses/[city]` | `#course-pages` |
| `/tools/<slug>` | `#tools-<slug>` |
| The goal pages | `#tools-goal-pages` |
| The pace charts | `#tools-pace-charts` |
| `/runners` | `#runner-search` |
| `/report` | `#race-report` |

### 2.4 Phone navigation

| Element | Spec |
|---|---|
| **Header** (`components/SiteHeader.tsx`, 56 px on phones, 64 px from 900) | Left: the brand mark and "Pace Notes" (`.header-brand`). The "by Andrew Kam" credit shows from 600 px. Right: the units switch `.unit-switch` (role group, label "Distance and pace units", visible MI / KM with "Miles" / "Kilometres" as accessible names, markup unchanged) and the **Menu** button `.nav-toggle` ("Menu" plus a glyph, 44×44 or larger). Background: paper at 92% with `backdrop-filter: blur(12px)`, falling back to solid paper under `@supports not`. It hides on scroll down and returns on scroll up (transform only, as today). It stays visible while the menu is open, while it holds focus and under reduced motion. At 299 px and below the controls take a second row (today's rule) |
| **Reading bar** (inside `SiteHeader`, 36 px) | Shown on pages that set `data-reading` on `main`: stories, analyses, `/slowdown`, `/finish-times`, course pages and `/methodology`. When the header hides, the reading bar slides in at the top in its place. Left: the `MarkerBadge` and the page's `short` title (Inter 13/600). Right: "{n} min left" (Inter 13, ink-3). Along the bottom edge runs a 2 px progress line: ink up to the reading position, a signal dot at the position and a 1 px tick at every beat start (`[data-beat]`). Minutes left = words below the viewport ÷ 238, plus 12 s per figure below it, rounded up, minimum 1. Words are counted in the browser once after load from `main [data-beat]`; nothing is sent anywhere. `aria-hidden="true"`, because the headings already give this information. Under reduced motion it swaps in without sliding |
| **Menu sheet** (`components/MenuSheet.tsx`, below 1180 px) | A bottom sheet under 600 px and a right drawer of 420 px from 600 to 1179 px. `role="dialog" aria-modal="true" aria-labelledby`, a 44 px close button, a scrim of night at 40%, focus trapped, Escape and a scrim tap close it and focus returns to `.nav-toggle`, body scroll is locked, and when closed it is `inert` with `visibility: hidden` so a closed sheet can never be focused. Top to bottom: **(1)** `nav#site-menu.main-nav`, holding exactly today's five links in order with exact text ("Plan your race" `.nav-primary` as the orange pill, then Analyze a past race, Courses, Tools, Research) as 52 px rows, then the `.nav-more` line (About, Request an analysis, Open data ↗). **Nothing else goes inside `#site-menu`** (S1). **(2)** `nav.chapter-list[aria-label="Chapters"]` in its compact variant (§3.5), with "You are here" on the current chapter. **(3)** A small row: Methodology · Privacy. At 200% zoom (195 px) every link scrolls into view with its text inside its pill (S1) |
| **In-page** | Each beat has an anchor (the existing story ids are kept, §7). Course pages keep `nav.course-toc`, a 44 px chip row that sticks under the header on phones and scrolls sideways with an edge fade. There is no horizontal swipe between pages, because horizontal drags belong to charts and decks |
| **"Make it yours" chip** (analyses only; course pages use a goal Segmented) | §3.5. It appears only while its explorer beat is on screen, and it is never fixed over the hero, a next card or the footer |

### 2.5 Desktop navigation

- **At 1180 px and wider:** the header shows the brand, the **five links inline** (the same `nav#site-menu`, with `.nav-more` hidden as today), the units switch and a **Chapters** button (`.chapters-toggle`, not `.nav-toggle`). The button opens the right drawer, which holds only `nav.chapter-list`.
- **From 900 to 1179 px:** the Menu button and the drawer, as on phones.
- **Rail at 1180 px and wider on chapter pages** (`components/ChapterRail.tsx`): a sticky left column of 200 px. From the top:
  - the marker and the chapter title;
  - the chapter's pages, with `aria-current` on the current one;
  - the current page's beats as anchors, with the beat in view highlighted by an IntersectionObserver.

  Course pages have no rail: `nav.course-toc` covers in-page navigation.
- **Desktop layouts:**
  - Heroes are two columns from 900 px (copy 5/12, figure or replay 7/12).
  - Beats are a centred column with a 36 rem text measure, and figures run to 52 rem.
  - Scrollies run side by side from 900 px: the step text in a 26 rem column on the left and the sticky graphic on the right.
  - No page leaves a 1440 px frame mostly empty.

### 2.6 The closing stack, and next and previous

`components/ChapterEnd.tsx` (WP0-B) ends every page in the chain, inside a wrapper with `data-track-section="related"`. On a phone it fits in 640 px:

1. **"Also in this chapter"**, only when `also` is set: up to three 44 px rows.
2. **The next card** (`components/NextCard.tsx`): night surface, radius 16, 24 px padding, full width on phones and at most 52 rem on desktop.
   - Kicker (mono 12): "Next · [MarkerBadge] Chapter 03 · The shape of a race", or "Next in this chapter".
   - The next page's title (Fraunces, H2 size).
   - Its reading (Bricolage figure-m, then the key line). **When the next page opens a new chapter, the card shows that chapter's `lead` and `key` instead**, so every chapter is announced by its headline number.
   - A 48 px accent go button with an arrow.
   - The whole card is a single `<a class="next-card">`.
   - On analysis pages the stack sits inside `nav.analysis-pagination` (S2 pins `.analysis-pagination a`); on stories, inside `nav.story-pagination`.
3. **A row:** "← {previous short}" (44 px) on the left and "How we know ↗" (to `howWeKnow`) on the right.
4. **`PageFeedback`**, restyled as one compact row: "Was this useful? [Yes] [No]", then the four fixed reasons. The markup, the button text and the absence of a text box are unchanged (S6).

**The finish card.** `/tools/plan` ends the journey with a checkered rule and "You've read the race, start to finish." It links to Contents and to Analyze a past race.

**Reference pages** end with "More tools" or "Back to Contents" plus `PageFeedback`. They have no next card.

**Removed everywhere:**
- the tool promo cards;
- the duplicate "More tools" lists after the next card;
- "What this can tell you";
- download links in body copy;
- the old prev/next label variants.

### 2.7 Home page structure (the pinned section ids are unchanged)

The pinned order holds: `hero, paths (inside hero), stakes, guide, steps, stories, cta`, with no `chapter-*` on `/`. `verify-analytics` (line ~681), S6 `HOME_SECTIONS` and `home_depth@v1` all stay valid. The full spec is in §7.1.

| Section | `data-track-section` | Content |
|---|---|---|
| Hero (night, full-bleed) | `hero` | The replay band (`.hero-replay.replay`) with the first-finish flag sentence, then the kicker, `h1#hero-title`, `.home-hero-dek` (600 px and up) and `HomeDoors` |
| Paths (inside the hero) | `paths` | `form.home-door.home-plan` with GET to `/tools/plan`: `#home-plan-course`, `#home-plan-goal` with the "Tap . for :" `KeypadHint`, `PlanFormUnits`, `.home-plan-button` "Plan your race", and two `.home-door-link`s: "Analyze a past race" (`/runners`) and "Read it start to finish" (`/finish-times`) |
| Stakes | `stakes` | A guess-first 100-dot question (faster second 20K), then one reading: about 3 in 10 had a sustained slowdown, with the onset bar |
| Guide | `guide` | "The race, *start to finish*.": the full `ChapterList` course line, 11 rows with readings |
| Steps | `steps` | "Plan in *three* steps.": 1–2–3 on a hairline |
| Stories (`#research`, the id kept) | `stories` | "Eight things *3.5 million* finishes say.": a swipe deck of 8 `a.story-card` nugget cards |
| CTA (night) | `cta` | The pixel runner lane with time chips and "Your next marathon starts with *a plan*." |

### 2.8 Footer (`components/SiteFooter.tsx`, new; moved out of `app/layout.tsx`)

The footer is at most 0.6 of a phone screen.
- A checkered top rule (today's conic gradient).
- The brand "Pace Notes", then one line: "How marathons are actually run, read from every recorded 5K split." Then `CreatorCredit`.
- Links: two columns on phones, one row on desktop, 44 px rows. Plan your race, Analyze a past race, Courses, Tools, Research, Methodology, About, Privacy, Request an analysis, Open data ↗. S1 needs `footer a[href="/privacy"]`.
- A last row: the `MotionToggle` switch ("Motion", 44 px hit area) and "Pace Notes · by Andrew Kam".

### 2.9 Redirects and legacy (WP8 implements `vercel.json`)

| From | To | Kind |
|---|---|---|
| `/analyses/warming-and-pacing` | `/analyses/race-day-weather#warming` | 308, plus a noindex stub |
| `/analyses/wind-and-pacing` | `/analyses/race-day-weather#wind` | 308, plus a noindex stub |
| `/research/personalized` | `/research` | 308, plus a stub that forwards `#guide-*` |
| `/packs/<alias>` (each alias in `lib/packs.ts` that names a primary canonical) | `/packs/<primary>` | 308, plus a noindex stub |
| `/htw`, `/packs/smyth_htw`, `/tools/marathon-pace` | unchanged | existing |

Every stub uses the `LegacyAnalysisLink` pattern:
- a visible "This page has moved" H1;
- a link to the target;
- a client-side forward that keeps the hash;
- `robots: noindex`;
- the target as its canonical URL.

Stubs leave the sitemap.

---

## 3. The design system

### 3.1 Colour tokens (`app/styles/tokens.css`)

Every colour lives as a custom property on `:root`. Component CSS and SVG never use a raw hex. Canvas code reads tokens through `getComputedStyle(document.documentElement)` when it starts, so `RaceReplay`'s hard-coded colours go.

Every contrast figure below was computed with the WCAG formula, and every palette was checked with the dataviz skill's `validate_palette.js`. The scripts are in `spec-check/` in this folder.

**Legacy tokens keep their exact values,** so that `scripts/build-og-images.cjs` TOKENS does not throw. These are `--night`, `--night-3`, `--night-ink`, `--night-ink-2`, `--ink`, `--card`, `--orange`, `--gold`, `--blue`, `--green`, `--rose`, `--violet` and `--teal`. The aliases `--slate --course --wall --rule --wash --muted --text --accent --panel` map onto the new semantic tokens until WP9 deletes them.

The theme colour stays `#F5F0E6`. Dark mode adds `media="(prefers-color-scheme: dark)" #111419` through `viewport.themeColor` as an array.

**Light, the page theme (default)**

| Token | Hex | Job | Contrast |
|---|---|---|---|
| `--paper` | `#F5F0E6` | page background | — |
| `--paper-raised` | `#FFFDF8` (= `--card`) | sheet, receipt on paper, guess panel, inputs, share preview | — |
| `--paper-sunk` | `#EDE6D8` | segmented track, tags, code | — |
| `--rule` | `#DCD3C2` | hairlines and gridlines | — |
| `--rule-strong` | `#C9BFAB` | axis baseline, input borders | — |
| `--ink` | `#15171C` | headings, figures, the subject's marks | 15.79 on paper |
| `--ink-2` | `#3C3F47` | body text | 9.27 |
| `--ink-3` | `#66625A` | muted text and ticks | 5.34 (4.89 on sunk, 5.97 on raised) |
| `--mark-quiet` | `#857F73` | context marks (other courses, other years) | 3.50 (3.91 on raised) |
| `--fill-quiet` | `#C9BFAB` | silhouettes and tracks **only with a 1.5 px `--mark-quiet` edge** that carries the 3:1 | 1.60 |
| `--signal` | `#E5461A` | **the reading**: the finding mark, the needle and the reader's ring | 3.54 on paper, 3.96 on raised |
| `--signal-ink` | `#B4380D` | italic accent words, text in the signal role | 5.26 |
| `--signal-wash` | `rgba(229,70,26,.10)` | the region a finding is about ("behind", the climb section) | — |
| `--accent` | `#FF5B2E` (= `--orange`) | **the primary button fill and the brand mark only**. S1 pins `rgb(255, 91, 46)` | ink text on it 5.80 |
| `--accent-press` | `#E84C20` | pressed primary | — |
| `--focus` | `#2346E6` | focus ring (2 px, 2 px offset) | 5.98 |
| `--ordinal-1…4` | `#ADA390 #8A8273 #676155 #444038` | one-hue ordinal ramp, for ordered buckets shown together | validated: monotone, light end 2.20:1 |
| `--pace-ramp` (in JS) | `PACE_RAMP` in `lib/viz/format.ts`, from `#1D3FD8` through `#EFE8DA` to `#C8202F` | diverging faster/slower, **for heatmaps only** (barcode, pace blocks, fingerprint rows) | ends validated (CVD ΔE 27.3) |

**Night: the race and the answer** (`.night`, at any theme)

| Token | Hex | Job | On `#0E1116` |
|---|---|---|---|
| `--night` | `#0E1116` | surface | — |
| `--night-2` | `#171B22` | raised on night, controls | — |
| `--night-3` | `#252B36` | hairlines | — |
| `--night-ink` | `#F5F0E6` | text, the subject's marks | 16.65 |
| `--night-ink-2` | `#B9B3A6` | secondary text | 9.06 |
| `--night-ink-3` | `#8E897E` | ticks, keys | 5.43 |
| `--night-mark-quiet` | `#6B7180` | context marks | 3.87 |
| `--night-fill-quiet` | `#2A303B` | tracks, with an edge | 1.43 |
| `--night-signal` | `#FF6A3D` | the reading, and dots at sustained-slowdown pace in the replay | 6.65 |
| `--night-signal-ink` | `#FF7A50` | the italic accent on night | 7.34 |
| `--night-ordinal-1…4` | `#4A505C #6B7180 #9097A5 #B9BECA` | ordinal on night | validated |
| `--focus-night` | `#F4B23E` (= `--gold`) | focus ring on night | 10.16 |

**Pacing types: the categorical palette, used for types only and always shown with the type's shape glyph and a direct label.** Order: Metronome, Gentle fader, Late fader, Early drifter, Cliff, Fast-start fader.

| Surface | Hexes | Validator result |
|---|---|---|
| Paper | `#0F8F62 #2F5BFF #B07A0C #7A4DFF #E2416B #8E4512` | all checks pass: CVD ΔE ≥ 13.1, normal ΔE ≥ 19.6, every colour ≥ 3:1 |
| Night | `#139C6C #5A7CFF #C08A1C #8D6CF5 #E0507A #B57A2E` | passes. One adjacent pair (fast-start fader and Cliff) sits at CVD ΔE 7.8, in the floor band; legal because the rows are labelled and carry glyphs |

The fast-start fader moves off orange (owner decision 8), so orange only ever means "the reading". The palette lives in `lib/viz/palette.ts` (`ARCHETYPE_COLOURS`), not in CSS, because server components need it.

**Dark: the page theme under the OS setting.** It is a chosen palette, not an inversion, and ships in WP9 (§3.9).

| Token | Hex | Contrast on `#111419` |
|---|---|---|
| `--paper` | `#111419` | — |
| `--paper-raised` | `#181C23` | — |
| `--paper-sunk` | `#1F242D` | — |
| `--rule` / `--rule-strong` | `#2A3039` / `#3A414D` | — |
| `--ink` | `#F2EDE3` | 15.82 |
| `--ink-2` | `#CFC9BD` | 11.20 |
| `--ink-3` | `#A39D91` | 6.84 (5.78 on sunk) |
| `--mark-quiet` | `#7A808C` | 4.65 |
| `--fill-quiet` | `#2E3440` (with an edge) | 1.48 |
| `--signal` | `#FF6A3D` | 6.49 |
| `--signal-ink` | `#FF8A63` | 7.97 |
| `--accent` | `#FF5B2E` (unchanged; ink text on it) | 5.97 |
| night surfaces inside dark | `--night: #07090C`, so the race bands still read as their own surface | — |

Pacing types use the night set in dark mode. Charts never pick colours by theme in JS: they read the tokens.

**Evidence badges get no hue.** Each badge is a glyph and a word in `--ink-2`:
- ● Pace Notes data
- ◆ Published research
- ■ Official standard

The class names `evidence-badge evidence-data|research|official` are kept.

### 3.2 Type

**Families (self-hosted from `public/fonts/`, Latin plus Latin Extended):**

| Face | File (from `@fontsource-variable`) | Latin size | Job |
|---|---|---|---|
| Fraunces, `wght` and `opsz` axes only (no SOFT, no WONK) | `fraunces-latin-opsz-normal.woff2`, `-opsz-italic.woff2` | 67.3 KB + 81.5 KB | display, headings, the reading's sentence, the italic accent |
| Inter, `wght` | `inter-latin-wght-normal.woff2` (plus Cyrillic, Greek and Vietnamese subsets for runner names) | 48.3 KB | body, UI, readout values, direct labels |
| Bricolage Grotesque, `wght` | `bricolage-grotesque-latin-wght-normal.woff2` | 41.3 KB | **the reading figure only**: big numbers, bib chips, the share card figure |
| JetBrains Mono, `wght` | `jetbrains-mono-latin-wght-normal.woff2` | 40.4 KB | kickers, axis ticks, the replay clock and HUD keys. **Never row labels, readout keys or chart legends** |

- A first visit downloads **278.8 KB** of Latin woff2, against about 400 KB today.
- Fraunces opsz normal and Inter wght are preloaded from `app/layout.tsx` with `<link rel="preload" as="font" type="font/woff2" crossorigin>`, base-path aware.
- `font-display: swap`.
- `scripts/font-fallbacks.cjs` must regenerate the metric-matched fallback faces for the new files and settings. `--check` must pass, and CLS must stay at 0 on font swap.
- The hero figure is a sans (Bricolage), in line with the dataviz rule, and uses proportional figures. Readouts and table columns use `font-variant-numeric: tabular-nums`.
- Arrows (→ ↗ ←) fall outside Inter's Latin range, so every arrow is an inline SVG, `components/ui/Arrow.tsx`.

**Scale (phone → desktop through `clamp`; line-height and tracking given):**

| Token | Face and weight | Size | LH · tracking | Use |
|---|---|---|---|---|
| `--t-display` | Fraunces 440, `opsz` auto | `clamp(2.25rem, 8.6vw + .2rem, 5.25rem)` | 1.0 · −0.024em | home and story H1. `text-wrap: balance` |
| `--t-title` | Fraunces 440 | `clamp(2rem, 6.8vw + .2rem, 4.25rem)` | 1.04 · −0.02em | analysis H1 (a sentence) and course H1 |
| `--t-h2` | Fraunces 450 | `clamp(1.625rem, 5.4vw + .2rem, 2.625rem)` | 1.1 · −0.018em | a beat's finding. Always a finding, never a topic |
| `--t-sentence` | Fraunces 420 | `clamp(1.25rem, 4.4vw + .1rem, 1.625rem)` | 1.25 · −0.01em | the reading's sentence, guess questions, next-card titles. `text-wrap: pretty` |
| `em` inside any of the above | Fraunces italic, same weight | — | — | colour `--signal-ink` (`--night-signal-ink` on night). It wraps **the number or the comparison** |
| `--t-figure-xl` | Bricolage 680 | `clamp(4.5rem, 24vw, 9rem)` | 0.86 · −0.035em | the page's reading |
| `--t-figure-l` | Bricolage 680 | `clamp(3rem, 14vw, 5.5rem)` | 0.9 · −0.03em | receipt result, nugget cards |
| `--t-figure-m` | Bricolage 660 | `clamp(2.25rem, 9vw, 3.5rem)` | 0.95 · −0.025em | contents readings on desktop, next cards, course glance rows |
| `--t-figure-s` | Bricolage 640 | 1.75rem | 1 · −0.02em | contents readings on phones, cells |
| figure unit suffix | Inter 500 | 0.36em of the figure | baseline | `%`, `×`, `min`, `ft` in `--ink-3`. Never superscript |
| `--t-readout` | Inter 600, tabular | 1.75rem → 2rem at 900 | 1.05 · −0.02em | the value under the needle (it changes under the thumb, so it must not jitter) |
| `--t-body` | Inter 400 | 1.0625rem (17 px) → 1.125rem at 900 | 1.6 | body, colour `--ink-2`, `cv11 ss01` |
| `--t-small` | Inter 400 | 0.875rem (14 px) | 1.45 | secondary text, captions of controls |
| `--t-label` | Inter 600 | 0.8125rem (13 px) | 1.3 | readout keys, chip and segment labels, contents keys, input labels. Sentence case |
| `--t-direct` | Inter 600 | 0.875rem (14 px) | 1.2 | direct labels on chart marks (secondary labels 13 px) |
| `--t-kicker` | JetBrains Mono 500, uppercase | 0.75rem (12 px) | 1.4 · 0.12em | beat kickers ("01 · The towers"), crumbs, marker badges |
| `--t-tick` | JetBrains Mono 500, tabular | 0.75rem (**12 px minimum, everywhere**) | 1 | axis ticks |

**Hierarchy rules.**
- One figure-xl per page, in the reading.
- Kickers appear only at the head of a beat, in the crumbs and on the marker badge. They are never stacked two deep and never used for row labels.
- Bold body text is Inter 600, not 700.
- An italic accent goes on at most one phrase per heading.

### 3.3 Space, radii, shadow, motion and layers

| Group | Tokens |
|---|---|
| Space (4 px base) | `--s-1` 4 · `--s-2` 8 · `--s-3` 12 · `--s-4` 16 · `--s-5` 24 · `--s-6` 32 · `--s-7` 48 · `--s-8` 64 · `--s-9` 96 · `--s-10` 128 |
| Rhythm | `--beat-gap: clamp(64px, 12vw, 120px)` between beats · `--head-gap: 20px` below a beat head · `--figure-gap: 16px` between a readout and its plot |
| Radii | `--r-xs` 6 (marker badge, tags) · `--r-sm` 10 (inputs, cells) · `--r-md` 16 (receipt, next card, nugget card, replay frame from 600 px) · `--r-lg` 24 (top corners of the sheet, the share card) · `--r-pill` 999 (buttons, chips, segmented) |
| Shadow | `--shadow-raise: 0 1px 2px rgb(21 23 28 / .06), 0 6px 20px rgb(21 23 28 / .06)` for the segmented thumb, the chip in its floating state and the sheet's top edge. `--shadow-sheet: 0 -8px 40px rgb(21 23 28 / .18)`. **Beats, receipts and cards on paper have no shadow**; a 1 px `--rule` border separates them |
| Motion: easing | `--ease-out: cubic-bezier(.16,1,.3,1)` · `--spring` as CSS `linear()` sampled from a damped spring (ζ ≈ 0.62, one 8% overshoot), with fallback `cubic-bezier(.34,1.36,.64,1)` behind `@supports (transition-timing-function: linear(0, 1))` · `--spring-soft` (ζ ≈ 0.8), with fallback `cubic-bezier(.3,1.15,.6,1)` |
| Motion: duration | `--d-press` 90 ms (down) and 420 ms (release) · `--d-quick` 160 ms (chips, hover) · `--d-toggle` 480 ms (segmented thumb, switch) · `--d-sheet` 560 ms · `--d-reveal` 700 ms (a beat's figure arriving) · `--d-draw` 900 ms (a line drawing in) · `--d-step` 600 ms (scrolly state change) · stagger 8 ms per dot, at most 800 ms in total |
| Layers | `--z-header` 50 · `--z-reading` 51 · `--z-chip` 40 · `--z-sheet` 60 · `--z-scrim` 59 · `--z-toast` 70 |
| Layout | `--gutter: clamp(16px, 4.1vw, 48px)` · `--container: 1200px` (1320 px with the rail) · `--measure: 36rem` (text) · `--measure-figure: 52rem` · `--measure-wide: 75rem` · `--header-h: 56px` (64 px from 900) · `--reading-h: 36px` · `--chip-h: 48px` |

### 3.4 Grid and breakpoints: one scale

| Name | Query | What changes |
|---|---|---|
| base | phones from 320 px | one column. The 16 px gutter gives 358 px of content at 390 px. Cells and receipts use 2–3 equal columns divided by hairlines |
| `narrow` | `(max-width: 359.98px)` | multi-column cells step down one column; the doors stack; the "Make it yours" chip goes inline (it stops floating) |
| `tiny` | `(max-width: 299.98px)` | the header takes two rows; figure-xl clamps to 3.5 rem (200% zoom on a 390 px phone is 195 px) |
| `sm` | `(min-width: 600px)` | the header credit shows; the menu becomes a right drawer; the replay frame gets a radius; decks show 1.5 cards |
| `md` | `(min-width: 900px)` | two-column heroes (5/12 and 7/12); side-by-side scrolly; inline analysis controls (no sheet); 18 px body; the header is 64 px |
| `lg` | `(min-width: 1180px)` | five links inline in the header; the chapter rail (`200px \| 48px gap \| content`); decks become grids |

These six queries replace today's 30-odd widths. `scripts/verify-css.cjs` (new, WP0-A) fails on any other `@media` width in `app/styles/**`. Print rules and `prefers-*` queries are exempt.

Container queries (`@container`) are allowed inside chart frames, with a fallback. `aspect-ratio` reserves chart boxes, with a `padding-top` fallback.

### 3.5 Components: anatomy and states

All shared UI lives in `components/ui/` and charts in `components/viz/`.
- No component imports CSS. Verifiers load components through the TypeScript require hook, so CSS lives in `app/styles/components/*.css`.
- Server components by default. Client islands are named `*.client.tsx` and hold only the interaction.
- Every interactive state has a visible focus ring (`--focus`, or `--focus-night` on night).
- Every hit area is at least 44×44 px. The one exception is inline links inside a paragraph.

#### Reading (`components/ui/Reading.tsx`): the page opener
```
LABEL ──────── CHAPTER 06 · THE FINISH LINE · STORY 1 OF 2      (crumbs, kicker 12, ink-3; links 44 px tall)
H1 ─────────── The 3:59 effect                                  (--t-display or --t-title)
DEK ────────── Do finish times bunch up just under round numbers? (--t-body, ink-2, ≤ 2 lines: the question)
────────────── hairline
FIGURE ─────── 1.73×                                            (--t-figure-xl, ink; suffix ink-3)
UNIT LINE ──── the smooth curve, in the minute before 3:00      (--t-small, ink-2)
SENTENCE ───── Between 2:59:00 and 2:59:59, 15,856 finishes     (--t-sentence; em = the comparison)
               landed: *1.73 times* what a smooth curve expects.
INSTRUMENT ─── ruler | DotGrid | mini lens | receipt | year strip  (≤ 120 px tall, the sentence's number drawn)
FOOT ───────── [Share ⤴] · term link                            (optional; 44 px)
```
- **Variants:**
  - `figure`: the default.
  - `receipt`: analyses (see Receipt).
  - `pair`: "20% · 45%", two figures with a dumbbell ruler.
  - `range`: "19–46%", with a strip.
  - `null`: the figure in `--ink-3` with a "≈ 0" style. Used when a guard says there is no clear difference.
- **States:** default; fallback (guard false: the neutral sentence, and the figure becomes the plain observed value); reduced motion (nothing animates); dark.
- The figure is real text. An `sr-only` twin holds the full value and its unit ("1.73 times").

#### Receipt (`components/ui/Receipt.tsx`): the analysis answer
```
┌ night, r-md, 20 px padding, zig-zag bottom edge (CSS mask, 8 px teeth) ────────┐
│ RACE RECEIPT                                   FIRST 5K MORE THAN 10% FAST      │ kicker row
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │ 1 px dashed night-3 (this is a receipt tear line, not a grid)
│ First 5K                        ahead of the same pace                −2:42     │ label (Inter 15) · key (13, night-ink-3) · value (Inter 600 28 tabular)
│ After 20K                       behind                                +7:42     │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│ At the finish                                                    5:00 behind    │ --t-figure-l, --night-signal
│ Sustained slowdown              typical for the race and pace: 37%     54%      │ + an inline ruler (typical hollow, observed signal)
│                     SAME RACE · SAME 5–20K PACE                                 │ footer kicker (owner decision 12)
└────────────────────────────────────────────────────────────────────────────────┘
For your goal 4:00: more than 10% fast is a first 5K under 25:36. Even: 28:26. [Change]
```
- **Rules:**
  - At most 4 lines plus the result.
  - No paragraph inside.
  - The page does not repeat the values in prose.
  - Direction is carried by sign and words, not by colour; only the result is signal.
- **The goal line** sits under the card on paper. It is a plain calculation from the page's goal and the band threshold helper in `lib/fast-start.ts` (never re-derived). The `[Change]` button opens Make it yours. It lives inside `.analysis-layout` (masked).
- **States:** default (goal 4:00); goal set from the URL `goal` or the sheet; fallback (a guard is false, so the result line becomes a neutral "Finished {x} {ahead|behind}" built from its sign).

#### Nugget card (`components/ui/NuggetCard.tsx`): the deck, `/stories`, story cards
- Anatomy:
  - a kicker row: MarkerBadge, "Chapter 04", and a share icon button on the right (44 px);
  - the figure (`--t-figure-l`);
  - the claim (Fraunces 20/1.2, at most 3 lines, `em` on the finding);
  - a micro-viz, at most 64 px tall, rendered on the server;
  - a foot link ("Read the story", arrow, 44 px).
- Surface: `--paper-raised`, 1 px `--rule`, radius 16, 20 px padding. The night variant is for answer-type nuggets. **Content-sized; no min-height.**
- In a deck the card is 82% wide on phones (the next one peeks), 46% at 600 px, and a 4-up grid at 1180 px.
- States: default, hover (the border goes `--rule-strong` and the card lifts 2 px), focus-visible, pressed (scale .98 for 90 ms).
- The whole card is one link (`a.story-card` on the home page). The share button is a sibling, positioned over the card, so links never nest.

#### Big number (`components/ui/BigNumber.tsx`)
- Props:
  - `value`: a string already formatted by `lib/nuggets/format.ts`;
  - `unit?`;
  - `size: xl | l | m | s | auto`. `auto` is the default: xl for 5 glyphs or fewer ("1.73×", "4:10", "30%"), l for 6–8 ("20% · 45%", "+5:00"), m beyond ("197 of 225"). A figure never wraps and never overflows at 320 px;
  - `tone: ink | signal | night | quiet`;
  - `sr`: the full spoken value.
- Proportional figures. A count of 10,000 or more takes separators. **A count is never written "10K"**, because 10K is a distance on this site.

#### Chart frame (`components/viz/ChartFrame.tsx`): every figure
```
figure.viz  (keeps .viz svg out of session replay)
├ [lens]      Segmented or Chips, 44 px                      optional, one per figure
├ readout     key (--t-label) · value (--t-readout) · up to 2 side values     64 px reserved; aria-live="polite" (literal)
├ hairline
├ plot        box reserved by CSS: aspect --r on phones, capped by --max; role="img" + aria-label = the finding
│             (or role="slider" with aria-valuetext when scrubbable)
├ axis        baseline --rule-strong; ticks 12 px mono; ≤ 3 gridlines labelled inside the plot on the clear side
├ crown row   the scrubber's drag handle, BELOW the tick labels (see Scrubber)
├ key         only for two or more encodings: swatch + text in ink (dot, line, square, ring)
└ Values      <details class="values">: the table twin
```
- **States:**
  - Loading: only for figures fed in the browser. The box keeps its size and a static poster is drawn. Never a skeleton flash.
  - Empty: not allowed for an answer. A filtered explorer shows "No published values for this selection" in `role="status"`; `verify-ten-analyses` pins that string.
  - Error: "This chart could not load" with a Retry, `role="alert"` (literal). S6 matches its error-state regex.

#### Readout (`components/viz/Readout.tsx`)
- The fixed block above the plot that **is** the tooltip on phone and desktop alike.
- Left: the key (e.g. "The minute before 3:00") and the value (2:59). Right: side values (e.g. "Finishes 15,856").
- `aria-live="polite"` written literally, `min-height: 64px`, tabular values.
- It updates only after a scrub settles for 150 ms, so screen readers are not flooded. Visually it updates every frame.

#### Annotation (`components/viz/Annotation.tsx` and `components/viz/labels.ts`)
- A direct label: Inter 600 14 px in ink, with an optional 1 px `--ink-3` leader line and a 2 px paper halo (`paint-order: stroke`).
- Labels go on: the subject, the extremes, the finding and you.
- `placeLabels(items, bounds)` places labels greedily:
  1. above, else below;
  2. flip to the clear side;
  3. nudge in 4 px steps;
  4. drop the lowest-priority label, which stays in Values.
- A label never overlaps a mark of the subject or another label, and never leaves the SVG's bounds. `scripts/design/lint-layout.cjs` checks this.

#### Scrubber and needle (`components/viz/Scrubber.client.tsx`)
- **Geometry.**
  - A 1.5 px needle in `--signal` runs from the top of the plot down to the axis baseline.
  - A stem passes behind the tick labels to a **20 px crown** (a filled signal circle with a 2 px paper ring) in the crown row below the ticks. The needle never crosses a tick label.
  - On histograms the needle stops at the top of the tower and does not cover it.
  - A "‹ drag ›" hint (`--t-label`, ink-3) shows beside the crown until the first scrub, then fades.
- **Input.**
  - `touch-action: pan-y` on the plot. A horizontal intent (a 6 px move with |dx| > 1.2·|dy|) scrubs; anything else scrolls.
  - A tap sets the needle.
  - The needle tracks the pointer 1:1 and **never eases**.
  - On desktop, hover moves the needle without a click. Leaving the plot returns it to the last tapped value.
- **Detents.** These are meaningful values: round marks, the best point, range ends and the value the headline names. Within 8 px the needle snaps to a detent and the tick flashes (scale 2.2 → 1 in signal, 220 ms). `navigator.vibrate?.(3)` fires on Android, wrapped in try/catch.
- **Keyboard.** `role="slider"` with `aria-valuemin`, `-max`, `-now` and `aria-valuetext` (e.g. "First 5K 2–3% slower than the next 15K, finish 1:46 ahead"). Arrows step one data point, PageUp/PageDown step one detent, Home/End go to the range ends.
- **Default position.** The detent the headline names, so the H1 and the readout always agree. This fixes C's "+5:00 vs +5:02".
- **States:** idle (crown with the hint), dragging (crown scale 1.15 with `--shadow-raise`), at a detent (tick flash), focused (focus ring around the plot), reduced motion (no flash animation).

#### Segmented control and chips (`components/ui/Segmented.client.tsx`, `components/ui/Chips.client.tsx`)
- **Segmented.**
  - For 2 to 5 options, with a 44 px track in `--paper-sunk`.
  - The thumb is `--paper-raised` with `--shadow-raise` and moves with `--spring` over `--d-toggle`.
  - Labels are `--t-label`: the selected label in ink 600, the others in ink-2.
  - Buttons inside `role="group"` with `aria-label`, and `aria-pressed` on each (today's pattern, kept for verifiers).
- **Chips.**
  - For more than 5 options, or a wrapping set: 44 px pills with a 1 px `--rule-strong` border. Selected chips are ink-filled with paper text.
  - A row that overflows scrolls sideways with a 24 px edge fade and `scroll-snap-type: x proximity`. **Never clipped without a cue**; the selected chip is scrolled into view.
- On night: a `--night-2` track, a `--night-3` border, a `--night-ink` thumb with ink text.
- **States:** default, hover, focus-visible, pressed (squash `scaleX(1.06)` for 90 ms), selected, disabled (ink-3 at 60%, `aria-disabled`).

#### Guess first (`components/ui/GuessFirst.client.tsx`): at most one per page
```
.guess.which-card   (masked: .which-card is a MASKED token in lib/replay-policy.ts)
QUESTION ── What share of finishes ran their second 20K faster than their first?   (--t-sentence)
CONTROL ─── slider 0–60 "of 100" (30 px thumb, 44 px hit) with a live "Your guess 15" readout,
            or Chips for a categorical guess
ACTIONS ─── [Lock it in] (secondary ink button)   Skip, show me (text link, 44 px)
REVEAL ──── on the SAME marks: the truth as --signal fills, the guess as orange rings with "You";
            typical or comparison values hollow in --mark-quiet
VERDICT ─── "You guessed 15. Only about *1 in 25* did."   aria-live="polite" (literal)
NEXT ────── Chapter 03 · The shape of a race →  (optional)
```
- Rules:
  - The guess lives in component state only. No storage and no URL.
  - It is never placed on `/stories/pacing-types`, because S2's `.which-card input` must stay the type calculator's.
  - It never guards a number that the H1 above already states.
  - "Skip" reveals at once.
  - The verdict never scolds ("wrong") and states the gap in plain numbers.
- **States:** asking, dragging, locked, revealed, skipped (revealed with no ring), reduced motion (the reveal is instant).

#### Scrolly (`components/ui/Scrolly.client.tsx`): one per story, for its signature finding
- **Structure.**
  - A sticky graphic (`figure.viz`, every layer rendered on the server) and 3 to 6 step blocks.
  - The steps set `data-step="n"` on the figure.
  - CSS moves layers with transitions of `--d-step` on `transform` and `opacity` only. A zoom is a `scaleX` of the data group around a point, with `vector-effect: non-scaling-stroke`. Text sits in an unscaled label layer that fades in.
- **Phone layout.** The graphic sticks at the top under the reading bar, 58svh tall (58vh fallback). Steps scroll through the remaining 42% **below the graphic**, as plain text on paper. They are not cards and never overlap the graphic.
- **Desktop (from 900 px).** The step column is 26 rem on the left and the graphic is sticky on the right.
- **Triggers.**
  - An IntersectionObserver per step with `rootMargin: 0px 0px -20% 0px` on phones (−28% from 900 px).
  - A state changes only when a step crosses that line; scroll position never maps continuously to animation, and scrolling is never taken over.
  - Scrolling back up reverses the states.
- **The JS budget:** about 0.7 KB gzip.
- **Reduced motion, or the Motion switch off:** the graphic unpins and shows its final state, and the step texts follow it as a short list. Nothing animates.
- **Accessibility:** each step is a `<p>` in reading order; the figure's `aria-label` is the final finding; the Values table is under the scrolly.

#### Chapter header (`components/ui/ChapterHeader.tsx`) and marker badge (`components/ui/MarkerBadge.tsx`)
- **MarkerBadge:** an ink plate, `--r-xs`, 24 px tall, mono 12 caps in paper text (on night: a paper plate with ink text). The FINISH badge has a 6 px checkered left edge. Variants: `START 5K 10K HALF 30K FINISH 07 08 09 10 11`.
- **ChapterHeader** = crumbs plus the H1 plus the dek, used inside Reading.
  - Crumbs: "[badge] Chapter 06 · The finish line · Story 1 of 2". The chapter part links to `/research#chapter-06` (44 px tall through padding).

#### Chapter list (`components/ui/ChapterList.tsx`): menu, contents, home guide
```
│  CHAPTER 01                                         4:10
[START] The field                                   median finish
│  Finish times, the replay
╎  (2 px dashed --ink-3 course line joins the badges; current chapter: a signal dot on the line + "You are here")
[ 5K ]  The first 5K                                +5:00
│  Starting pace, downhill starts                   at the finish, after a first 5K over 10% fast
```
- **Columns:**
  1. the course line with its badge (48 px);
  2. "Chapter 01" (kicker), the title (Fraunces 20) and the subtitle (Inter 14, ink-3);
  3. the reading (`--t-figure-s` on phones, `--t-figure-m` from 900 px) with its key (`--t-label`, ink-3, right-aligned, at most 2 lines, max 16ch).
- Part headings ("Part one · The race") sit between groups.
- **Variants:**
  - `compact`: the menu. Rows are 64 px and the subtitles hide under 360 px.
  - `full`: the home guide.
  - `expanded`: the contents. Each chapter also lists its pages as sub-rows (title, a kind tag such as Story / Analysis / Tool, and that page's reading).
- The whole row is a link to the chapter's first page. Sub-rows link to their page.
- **States:** default, hover (title underline), current (signal dot and "You are here"), focus-visible.

#### Reading bar (`components/ReadingBar.client.tsx`, mounted by `SiteHeader`)
See §2.4. States: hidden (header showing), shown (header hidden), complete (at 100% the dot sits on a checkered end cap), reduced motion (no slide).

#### Next card (`components/NextCard.tsx`)
See §2.6. States: default, hover (the go button nudges 4 px right), focus-visible (on the card), pressed, and finish (the `/tools/plan` variant).

#### Make it yours: a chip and a sheet (`components/ui/MakeItYours.client.tsx`, built on `Sheet`)
- **The chip (below 900 px).**
  - A 48 px pill, ink with paper text, at most 320 px wide, fixed 12 px above the bottom safe area and centred.
  - It shows the current selection: "All courses · 4:00 · All ages", then a chevron.
  - **It appears only while its explorer beat intersects the viewport,** and never over the hero, the next card or the footer: it hides when they intersect.
  - The explorer beat reserves `padding-bottom: calc(var(--chip-h) + 24px)`, so its last control or axis can always scroll clear of the chip.
  - Under 360 px (zoom), the chip renders inline at the top of the explorer beat and never floats.
- **The sheet.** A bottom sheet with title "Make it yours" holding **the page's existing control form**, moved as a single DOM instance:
  - Course, "Finish time to explore" (with the keypad hint), and `details.profile-refinements` with Age group, Recorded gender and Earlier marathon;
  - on checkpoint: `details.guide-optional`, /Previous marathon/, /Elapsed time/ and /Latest 5 km/;
  - on fast-start: the mode toggle and Opening pace;
  - then "Update comparison".

  Every S2-pinned label, id and button text is unchanged. **From 900 px the same form renders inline** at the top of the explorer beat, as a cell panel with no sheet, so S2's 1280×900 run sees it exactly as today.
- **Masking.** The chip and the sheet render inside `.analysis-layout` (masked), even though they are `position: fixed`. **No portal:** the sheet is the explorer's own form element, fixed-positioned in place under 900 px and static from 900 px, so it never leaves the masked region and its labels stay unique.
- **States:** hidden, visible, sheet open, updating (the chip shows a 2 px progress underline; results hold the previous render at 60% opacity, with no skeleton), error (an inline `role="alert"` in the sheet).

#### Sheet (`components/ui/Sheet.client.tsx`): menu, Make it yours, share
A bottom sheet under 600 px and a right drawer from 600 px. The rest is in §2.4: dialog semantics, focus trap, Escape, scrim, `inert` and hidden when closed, body scroll lock, `env(safe-area-inset-bottom)` padding, the `--spring-soft` slide over `--d-sheet`, a drag handle drawn for looks (the sheet closes by its button or the scrim; drag-to-dismiss is optional).

#### Values disclosure (`components/ui/Values.tsx`)
- `<details class="values">`: the summary row reads "Values" plus the row count, 48 px, with a plus/minus glyph.
- Inside: `div.table-wrap[role=region][tabindex=0][aria-labelledby=<caption id>]` holding a `table`.
  - The caption is visible as a small heading.
  - The first column is sticky; numbers are tabular; rows are 44 px.
  - When the table overflows, a right edge fade and a "Scroll →" cue show.
- Height animates with `interpolate-size` where supported, otherwise instantly.
- `CourseTable` keeps its classes (`tool-table-wrap course-table-wrap`, `tool-table course-table …`), as `verify-courses` pins them.

#### Share card and share sheet (`components/ui/ShareButton.client.tsx`, `lib/share-image.ts`, loaded lazily)
- **The card (1080×1350, drawn on a canvas, never uploaded).**
  - Night surface.
  - Kicker: "[marker] CHAPTER 06 · THE FINISH LINE" on the left, "PACE NOTES" on the right.
  - The figure in Bricolage at 280 px; the claim in Fraunces 64 px with the italic accent in `--night-signal-ink`.
  - A simplified micro-chart.
  - Footer: "splithappens.run{path}".
- **The sheet:** a preview `<img>`, then Save image (`pace-notes-<slug>.png`), Copy link and Share… (`navigator.share` when present).
- A "Add my goal to the card" checkbox appears only where the page has a goal, and is off by default.
- **No new analytics event**, so shares are not counted (owner decision 13). The renderer chunk loads on the first tap, so it adds no initial JS. It follows the `lib/report-image.ts` pattern; the report's own export keeps its own path.
- Fonts are drawn after `document.fonts.load()`.

#### Evidence badge (`components/tools/EvidenceTag.tsx`; the only file that draws badges)
- A glyph and a word (§3.1), `--t-label`, `--ink-2`, with no outline and no fill.
- As a link to `/methodology#evidence` it gets a 44 px hit area through padding. In a card that is itself a link, it is a plain `<span class="evidence-badge evidence-…">` (`compact`).
- Badges are never combined into one figure and never shown on plain calculations.

#### Tool workspace (`components/tools/ui.tsx` patterns; `.tool-workspace` > `.tool-inputs` + `.tool-results`)
- **Inputs: an instrument panel.**
  - Cells divided by hairlines, each 64 px: the label (`--t-label`, ink-3) above the value (Inter 500 22 px).
  - Selects get a chevron. Time fields use `inputMode="decimal"`, `keypadInput()` and `KeypadHint` ("Tap . for :", shown under `pointer: coarse`).
  - Errors: the value turns `--signal-ink`, a 2 px signal underline appears and a literal `role="alert"` message sits below.
  - On desktop (900 px and up) the inputs form a sticky left column (5/12) and the results the right (7/12).
- **Goal bar (phones):** the pace-band floating stepper, made universal for goal-driven tools (plan, pace band, course chooser, predictor). It reads "− 4:00 · 9:09/mi +" and appears once the inputs scroll out of view.
- **Results.**
  - The first child is the `sr-only aria-live` summary (literal).
  - Then the **result reading**: a night card with the figure and a ledger (mats as a lap list).
  - Then **one** Pace Notes data nugget with its badge.
  - Secondary outputs follow (tables inside Values; print views unchanged).
  - Then handoff rows ("Turn this into a pace band →", 52 px rows, not cards).
- **Removed:** per-tool hue bars and borders (`--tool` accents), "How this works" boxes, and the research essays (Published research stays only as its own badged panel).

#### Dot grid (`components/viz/DotGrid.tsx`): 100 finishes
- A 10×10 grid of 12 px dots with 8 px gaps, at most 220 px wide on phones.
- Lit dots: `--signal`. A comparison grid: `--ink`. Unlit: `--fill-quiet` with a `--mark-quiet` 1 px ring. A guess: orange 2 px rings with "You".
- It is always read as "of 100 finishes" and is labelled in its `aria-label`.
- Dots light in an 8 ms stagger on reveal (instant under reduced motion).

#### Ruler (`components/viz/Ruler.tsx`)
- A one-line hairline scale (0–100%, or a time range) with 4 or 5 ticks.
- Marks: the reading as a signal dot, typical or expected as a hollow `--mark-quiet` ring, a comparison as an ink dot, you as an orange ring.
- Labels go above the marks, with `placeLabels`.

#### Type glyph (`components/viz/TypeGlyph.tsx`)
A 40×18 sparkline of a pacing type's centroid, drawn on one shared y scale and stroked in the type's colour. It always sits next to the type's name.

#### Buttons, inputs, tags and tables (`components/ui/Button.tsx`, `app/styles/components/{buttons,forms,tag,table}.css`)

**Buttons.**

| Variant | Height and shape | Colours | Rule |
|---|---|---|---|
| Primary | 52 px (48 px compact), pill | `--accent` fill, ink text, Inter 600 17 | At most one per screen region. On the home first screen it is the only orange control |
| Secondary | same | 1.5 px ink border, ink text | On night: a night-ink border with night-ink text |
| Tertiary | 44 px | text plus an arrow | — |

- States: hover (the fill darkens 4%), pressed (`--accent-press`, `scale(.98)`), focus-visible, disabled (40% opacity with `aria-disabled`), loading (an inline 16 px spinner; the label stays).

**Inputs.** As in the tool workspace: 52 px or more, a `--paper-raised` fill and a 1 px `--rule-strong` border. Focus adds a 2 px `--focus` ring.

**Tags.** Kind tags (Story, Analysis, Tool): mono 12 caps in ink-3 on `--paper-sunk`, 22 px tall, `--r-xs`.

**Tables.** Inter 14 tabular. Headers are 13/600 in ink-3. Rows are 44 px with 1 px `--rule` dividers and no zebra striping.

#### Page feedback (`components/PageFeedback.tsx`)
Logic and markup are unchanged. It is restyled as one row ("Was this useful?" plus two 44 px buttons). Its reasons are 44 px chips and it has no text input.

### 3.6 Chart grammar, form by form

**Global rules.**
- **Size.** Plots run the full content width: 358 px at 390 px, and up to 52 rem on desktop.
- **Axes.** No y-axis line and at most 3 solid hairline gridlines in `--rule`. Tick labels are 12 px mono, **never smaller**.
- **Marks.**
  - Columns are at most 24 px wide, with a 4 px rounded data end, square at the baseline, and 2 px surface gaps. Minute histograms are a silhouette instead.
  - Lines are 2 px with round joins.
  - Dots are at least 8 px, with a 2 px surface ring.
  - Area washes sit at 10% of their hue.
  - Reference lines (zero, 1×, own average) are solid ink at 1 px. A dashed line is kept only for "even pace", "expected" or "typical", and the key says so.
- **Labels and keys.**
  - Direct labels are 14 px, and go only on the subject, the extremes, the finding and you.
  - A key appears only when there are two or more encodings.
  - Text never takes a data colour; the one exception is `--signal-ink` on the reading.
- **Units and counts.**
  - **Mats are named in both unit modes:** 5K, 10K … 40K, and "Finish".
  - Section ranges read "35–40K" and "40K–finish".
  - Paces, elevations, temperatures and non-mat distances follow the switch: one decimal for miles in prose, "26.2 miles", °F with °F gaps in miles mode.
  - Counts are written out (10,000), never "10K".
- **Time axes.** Year axes are time-scaled. A missing year (2020–21) shows a "No race" gap and is never closed up.
- **Identity.** Colour is never the only cue. Shape (filled, hollow, ring, glyph), labels or position carry the meaning too.
- **Values twin.** Every chart has its table in Values.
- **Session replay.** Every chart sits in `figure.viz`, which keeps it out of session replay. A chart that draws a visitor's input (a ring, or a needle set by a typed time) also sits inside a masked region.

| Form | Used on | At 390 px | Interaction | From 900 px |
|---|---|---|---|---|
| **Minute histogram (silhouette)** with a lens | round-numbers towers, `/finish-times` women vs men, your-minute lookup | Columns 1–1.6 px as a `--fill-quiet` silhouette with a 1.5 px `--mark-quiet` top edge. Minutes before round marks in ink, the finding in signal. The smooth curve 1.25 px ink-2. Ticks every hour; height 220 px | Scrub minutes, with detents at the marks. Lens Segmented "Finishes per minute \| Against the curve": the second view redraws the columns as diverging from a 1× line (the honest comparison, from C). The needle stops at the tower top | Height 300 px |
| **Ten-second bins around a mark** | round-numbers cushion | 30 bins (−3 to +2 min). Bins before the mark in ink, after in quiet, the peak in signal, labelled "−70 s"; the mark is a solid ink line | Segmented marks 3:00 to 5:00. Columns spring to the new mark and the peak marker slides. **The default mark is the one the headline names** | — |
| **Step-by-step reveal** | the signature beat of each story | See Scrolly | Steps | Side by side |
| **U-curve with a scrub, plus a share chart on the same x** | starting-pace | Top chart: finish against same-pace finishes, a 2 px ink line, a zero line labelled "same pace", "behind" washed signal. The best point is a hollow ring labelled "Best average finish −1:46". Under it, a second chart (its own y axis) for the sustained-slowdown share. Never two y axes on one chart | Scrub the opening, with detents at even, the best point and 10% fast. Readout cells: 5K · after 20K · sustained slowdown | Side by side with the readout |
| **Receipt bars** | the analysis answer | See Receipt | — | — |
| **Line profile with a band** | pacing-pattern, the course fingerprint, pace band held vs slowdown | x = mats; the median line 2 px ink; the p25–p75 band at a 10% ink wash; even pace dashed; the "after 20K" zone a faint wash; the crossing point labelled "here the clock turns" | Goal chips morph the line (`d` interpolated by a CSS transition where supported, otherwise swapped) | — |
| **Dot strip (beeswarm-lite)** | courses ranked (slowdown share, median finish, time after 20K), `/courses`, `/slowdown`, course pages | Dots 10 px stacked upward when they collide. The subject in signal with a leader label; extremes labelled under the axis; courses with fewer than 3 editions drawn hollow; others quiet. **Ranked by value, never A to Z** | Tap a dot (44 px hit, nearest-dot finder) → the readout; double tap or "Open" → the course page. Chips re-sort with FLIP | Single row 600 px wide |
| **Dumbbell list** | six openings, downhill vs other, age groups women/men, gender by band, types by course | Rows 44 px; the label column 34–44%; hollow = typical or other, filled = observed or subject; the gap in signal only when the sentence is about it | Tap a row → the readout | Two columns of rows |
| **Share bar (100% horizontal)** | onset by section, pacing-type mix | An HTML flex bar 28 px tall with 2 px gaps and exact proportions. The section that matters in signal, the others `--ordinal-*` or quiet. A label goes inside only if it fits with 8 px padding; otherwise below, on a leader. A 0% segment is not drawn and is listed in Values | Chips re-fill it with a `flex-grow` spring | — |
| **Stacked river** | pacing types by finish band | Vertical, finish bands top to bottom, 6 type streams; the Metronome stream labelled with its share at the top and bottom | A sticky label shows the band under the reading line (Scrolly-lite: the label updates per band) | Horizontal |
| **100 dots** | shares of finishes | See Dot grid | Reveal | — |
| **Waffle** | the 225 same-course weather pairs | 25×9 squares of 10 px with 2 px gaps. Lit (warmer year had more sustained slowdowns) in signal, others quiet | Tap a tile → "Berlin 2013 vs 2025: 44 °F vs 68 °F, 16% vs 28%" | — |
| **Year strip (lollipop)** | course hero, course weather, Boston cut-offs | One stem per edition on a time-scaled x with gaps. The selected year in signal; extremes labelled; the average as a dotted reference keyed "average" | Scrub years. Readout: year · share · median · start temperature | — |
| **Scatter (few points)** | course race-morning weather (20 or fewer) | 8 px dots with year labels that flip side on collision; the hot/cool pair joined by a 1 px dashed line keyed "the pair" | Tap a dot | — |
| **Binned effect band** | warming, wind | Five binned means (dots with whiskers) on a ±5 point scale with a zero line; the estimate and its interval as a band. **A null result is drawn grey inside a ±1 point "no material difference" band** | Tab switch | — |
| **Elevation plus pace blocks** | course pages, hills-and-pacing | **One shared height scale on every course page**, from 0 to the largest relief of any course in the release (computed at build, rounded up to 50 m). The profile is a 2 px ink line over a `--fill-quiet` area with an edge. Under it, nine section blocks of 28 px on `PACE_RAMP` with their values ("+7%") in Inter 600 13 on the block (ink or paper text for contrast). The climb section washed | Scrub along the course. Readout: section · climb in that 5K (one value) · pace against the course's own average | — |
| **Route** | course hero, `/courses` rows | The route as a 3 px night-ink line on a 12 px glow, 5K ticks, a start ring and a checkered finish, the signature or slowest section in signal with one leader label on the empty side | None (static) | — |
| **Replay (canvas)** | home hero, `/stories/race-replay`, course pages with a replay | See below | — | — |
| **Barcode heatmap** | pacing-types barcode | Rows of finishes × 9 sections on `PACE_RAMP` with a ramp key "faster … slower than own early pace"; the reader's row framed in a 2 px ink outline (never orange) | Finish-time scrubber selects the row | — |
| **Slope chart** | women's share by city, first → last year | Two columns of dots joined by 1.5 px lines; rising cities in ink, falling in quiet; the biggest movers labelled; a sentence "rose in N of M cities" | Tap a line | — |
| **Waterfall** | where-time-is-gained | Nine bars building the gap section by section from a baseline; 35–40K labelled; the first bar called out | Goal chips | — |
| **Cumulative curve** | finish-time-context | A CDF cropped to p1–p99. You are an orange ring on the curve at your target; detents at round marks | Scrub the target | — |
| **Ghost race** | even ghost, gender ghost, twins | Two runner dots (the existing `Runner` art) on one line 32 px tall, with the gap in time labelled between them | Scrub the race clock | — |
| **Section columns (states)** | final-kick "no second wind" | Five stacked columns (one per section after 20K) of 4 states with 2 px gaps; the "stayed slow" state in signal; labels on the last column | Tap a column | — |
| **Transition grid** | pacing-types habits | 6×6 cells of 40 px on `--ordinal-*` (repeat share), the diagonal outlined | Tap a type to light its row | — |
| **Fingerprint small multiples** | stories/courses | A 3-up scroll-snap grid of 108 px sparklines (deviation from own average against the typical course); the signature section glows | Tap → enlarge into the Readout | 6-up |
| **Mini lens, micro-viz** | nugget cards, contents | 64 px or less, no axes, one highlight | None | — |

**The replay** (`components/viz/RaceReplay.tsx`, rewritten to read tokens; `HeroReplay` keeps its fetch through `dataFetch`):
- **Field view, "rank lanes":**
  - x = distance covered, from the start to a dashed finish line on the right.
  - y = finish rank, fastest at the top.
  - The field draws itself as a needle that tilts as the race unfolds, so it reads even as a still frame (C).
  - Dots are 2 CSS px in `--night-ink` at 85%. Dots running at sustained-slowdown pace after 20K (25% or more slower than their own 5–20K pace) are `--night-signal`.
  - The HUD keeps the existing counters: the clock in mono 28 tabular and the race name on the left; the "finished" and "at slowdown pace" shares on the right.
- **Route view** (course pages and the replay story): dots on the route geometry, with the toggle "The field | On the route".
- **The moment.** Each edition has a flag frame: the first finish. Its sentence comes from the `replay.first` nugget ("When the first runner finished, *47%* of the field had not reached 20K.").
- **Play behaviour.** When the frame is 35% in view, autoplay runs once from the flag minus 20 race-minutes up to the flag, at 3 race-minutes per second. It then **pauses on the flag frame with the sentence shown**. ▶ continues to the last finish. The scrub range shows hour ticks. Tapping the canvas pauses.
- **Before data.** A server-rendered SVG poster of the flag frame: a 40-point quantile ribbon of positions, computed at build from `public/data/insights/replay/<slug>.json`, about 1 KB. The canvas fades in over it, so there is never an empty start line.
- **Reduced motion, or the Motion switch off:** the static flag frame with the sentence; play still works on request.
- **Default edition** by data: `argmax(moments.not_past_20_at_first / finishes)` across the replayed editions, never a city literal.
- **Load cost.** `RaceReplay` loads only on pages that render one, through `next/dynamic` with the fixed frame as its placeholder. Course pages without a replay stop shipping the 6.8 KB chunk.
- **Class names** `.replay` (blocked from session replay) and `.hero-replay` (exempt from S1's 200% zoom "wide" check) are kept.

### 3.7 Motion rules and reduced motion

1. **Only `transform` and `opacity` animate**, plus `stroke-dashoffset` for a line drawing in. Geometry attributes never animate, so old Safari works. Columns are drawn at full height and scaled (`transform-box: fill-box`).
2. **Motion explains a change of state:** data arriving (reveal), a selection changing (morph), contact (press or spring) or a step (scrolly). Nothing moves for decoration, apart from the pixel runners in the CTA lane, which stop after 30 s (the existing `useTicker` limit).
3. **One looping element per screen at most:** the replay, the CTA runners, or a ghost race while it plays.
4. **The needle never eases.** It is 1:1 with the thumb.
5. **No scroll-jacking and no continuous scroll-linked animation.** Scrolly steps are discrete. There are no CSS scroll-driven animations (Safari 15), no view transitions and no `@starting-style`.
6. **Reveals** fire once per page view when 18% of a figure is visible (IntersectionObserver, `components/ui/Reveal.client.tsx`, about 0.3 KB): the figure rises 12 px and fades in over `--d-reveal`; columns rise left to right with an 8 ms stagger; lines draw over `--d-draw`.
7. **Reduced motion** (`prefers-reduced-motion: reduce`, or the site's Motion switch `data-motion-off` with the existing `pace-notes-motion` key):
   - every duration becomes 1 ms;
   - reveals are visible on load;
   - scrollies unpin and show their final state;
   - the replay opens paused on its flag frame;
   - runners stand still;
   - dot staggers are instant;
   - haptic flashes are off.

   A single rule in `base.css` covers both: `@media (prefers-reduced-motion: reduce) { :root { --motion: 0 } }` and `[data-motion-off] { --motion: 0 }`. Every duration token is defined as `calc(<ms> * var(--motion, 1))`.

### 3.8 Accessibility rules

- **Structure.** A skip link to `#main`. One H1 per page; headings in order (pack pages lose their h1 → h3 jump). Landmarks: `header`, `nav` (main, chapters, course-toc, pagination), `main`, `footer`.
- **Targets.** Visible controls are 44×44 px or larger. The switch is drawn at 34 px with a 44 px hit area. Inline links in a paragraph are exempt but get 2 px vertical padding.
- **Contrast.**
  - Text: 4.5:1 or more (body and labels pass, §3.1).
  - Large figures: 3:1 or more.
  - Data marks: 3:1 or more against their surface. Fills below that carry a 3:1 edge.
  - Focus rings: 3:1 or more.
- **Charts.**
  - `role="img"` with an `aria-label` that states the finding (from the nugget sentence), or `role="slider"` with `aria-valuetext` when scrubbable.
  - Every chart has a Values table twin.
  - Hover views have keyboard equivalents.
  - Repeated controls get distinct accessible names ("Mark 4:00, cushion chart").
- **Live regions:** literal `aria-live="polite"` or `role="status"`/`role="alert"` attributes in the markup, never set dynamically (replay policy).
- **Dialogs:** the Sheet rules (§3.5).
- **Zoom:** at 195 and 201 px nothing overflows, overlaps or is clipped (S1). At those widths the chip goes inline and the header takes two rows.
- **Colour** is never the only cue. Forced colours (`@media (forced-colors: active)`): marks fall back to `CanvasText` with shape and label carrying identity, and signal marks get a 2 px outline.
- **Motion:** §3.7.
- **Language:** sentence case for all UI, numbers spoken in full in sr-only twins, and no all-caps body text (mono caps is limited to kickers).

### 3.9 Dark mode: decision

**Decision: ship an OS-following dark theme, with no in-page toggle and no new storage key.** It is built into the tokens in WP0 and switched on in WP9 once every package has passed its dark screenshots. Until then:
- the dark tokens sit under `:root[data-theme="dark"]` only;
- the screenshot tool sets that attribute through an init script;
- the `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }` block is added in WP9.

Night bands stay night in both themes, stepping to `#07090C` in dark. The replay gets a 1 px `--night-3` ring so it doesn't dissolve into a dark page. OG cards stay light. The fallback (owner decision 2) is to leave the media block out: the site stays light, and nothing else changes.

### 3.10 Copy and units rules (every package)

- **Voice.**
  - Findings, not topics: H1s and H2s state what the data shows.
  - One number per sentence where possible; two only for a comparison ("20% vs 45%").
  - Plain fractions from `inWords()`: the closest of 1 in 2, 3, 4, 5, 10, 20, 25, 50 or 100, with a relative error under 10%. Otherwise the percentage.
  - `approxWords()` for "about 3 in 10" and "just over 7 in 10".
- **Association language only.** "Went with", "had", "was followed by" and "finished". Never "causes", "costs", "leads to" or "because". Never "your chance", "your odds" or "you will". A goal-aware sentence reads "Of 100 finishes on 4:00 pace through 20K here, 9 made 4:00", never "you have a 9% chance".
- **Banned** (verifiers enforce these):
  - "arithmetic" anywhere in `app/`, `components/` or `lib/`;
  - "the wall";
  - "your chance(s)", including with up to two words between;
  - "fastest" in titles, descriptions, H1s and OG text;
  - "N runners" and "million runners" (counts are finishes);
  - on course pages: rank, fastest, toughest, harder, easier, similar, best, worst;
  - `private-export` and `20260912` in visible copy;
  - method copy (every `METHOD_COPY`, `BANNED` and `methodCopy` list in the verifiers);
  - in `RaceReport` and the report image: you, your, percentile, rank, record.
- **Terms.** "Sustained slowdown" links to `/methodology#sustained-slowdown` (`.term-link`) once per page, at its first use. "Recorded women", "recorded men" and "recorded gender".
- **Distances.**
  - Mats are named (5K … 40K, Finish) in both modes.
  - Prose distances not at a mat use one decimal in miles mode ("the last 1.4 mi"). Never "3.11 mi" or two-decimal miles.
  - "26.2 miles" and "the marathon distance" through `MarathonDistance`.
- **Denominators.**
  - One count family per sentence. The site total comes from one `siteTotals()` per surface (§5).
  - Never two different "all finishes" rates on one screen. Never "3.5 million" and "3.4 million" on the same page.
  - **Course-level numbers have two sources with fixed jobs:**
    - `/courses` and `/courses/[city]` use `courses.json`, so a dot on the index matches its course page;
    - cross-course comparisons on the analyses, `/slowdown` and the contents use the all-finisher evidence through the `courses.spread` nugget;
    - a screen never shows both.
- **Small groups.** No group with fewer than 100 finishes appears in a headline, a nugget or an extreme label. Extremes across courses also need 3 or more editions (5 or more where stated).

---

## 4. Page templates

Every page in §7 is one of these templates. Tracking ids are literals from `TRACKED_SECTIONS`. A shared component that takes a section id types it as `TrackedSection` (exported from `lib/analytics-policy.ts`) and spreads it as `{...(track ? { 'data-track-section': track } : {})}`. That is the existing `components/course/Fact.tsx` pattern: it never writes `data-track-section={…}`, which `verify-analytics` rejects.

### 4.1 Story (`/stories/[slug]`, and the chapter-narrative pages `/finish-times` and `/slowdown`)

```
main[data-reading]
├ hero            data-track-section="hero"    Reading: crumbs · H1 (title from lib/stories.ts getter) · dek (the question) · THE READING
├ beat ×4–6       chapter-1 … chapter-6        section#<existing id>.beat[data-beat]:
│                                               kicker "01 · The towers" · H2 finding · dek ≤ 2 lines · figure (ChartFrame) · Values
│                                               – exactly one beat may be the Scrolly (the story's signature finding)
│                                               – at most one beat is GuessFirst
│                                               – a visitor-input beat sits in its masked class (.finish-lookup, .which-card)
├ related         data-track-section="related" ChapterEnd (next card, ← prev, How we know ↗, PageFeedback)
└ rail (≥ 1180)   ChapterRail
```
- Each story body becomes its own chunk: `page.tsx` picks the body through `next/dynamic(() => import('@/components/story/bodies/<Body>'))`, so a story stops paying for the other seven.
- Data still crosses to the client once, through `<StoryData>`, and each body passes only the fields its islands need.
- JSON-LD: `Article` and `BreadcrumbList`, unchanged.
- **Removed:**
  - the 2–2.5-screen "Method, data and limits" boxes;
  - the JSON download links;
  - the night `StoryHeader` with its `RunnerLane`. The opener is paper; the runners now appear as data in the ghost races and the CTA.
- Phone length: **9 screens at most**. The scrolly takes about 3 of them.

### 4.2 Analysis (`/analyses/[slug]`)

```
main[data-reading] > div.analysis-layout     (masked; wraps the whole page so chip + sheet + receipt goal line are masked)
├ hero         hero        crumbs · H1 = THE FINDING (nugget headline) · dek = the question (TEN_ANALYSES.title) · Receipt or answer figure
│                          · goal line (where the page has a goal)
├ beat 1       chapter-1   the hero chart: scrub or guess-then-scrub (the page's one guess, with Skip)
├ beat 2–3     chapter-2…3 one nugget each, one interaction each (0–2 of them; see each page in §7)
├ explore      chapter-n   (always the last beat) "Make it yours": the existing explorer (AnalysisExplorer / FastStartAnalysis / AllFinisherAnalysis /
│                          CheckpointExplorer / WeatherAnalysis) with its form in the chip+sheet (< 900) or inline (≥ 900);
│                          its live headline keeps today's insightHeadline() grammar (pinned by verify-ten-analyses)
└ related      related     nav.analysis-pagination > ChapterEnd
```
- **No form ever comes before the answer.** Every default is computed at build: All courses, a 4:00 goal and all ages, unless stated otherwise.
- **Removed:**
  - the sticky "Essential ten" sidebar (the rail replaces it from 1180 px);
  - "What the data shows" count headlines;
  - "How to read this", "Keep in mind" and "How we calculated this";
  - `RelatedTool` promo cards (they become "also in this chapter" rows);
  - chart captions.
- Phone length: **6 screens at most**.

### 4.3 Course (`/courses/[city]`): the section order and tracking are kept exactly

```
hero              hero         section.night.course-hero: crumbs · H1 race · meta · THE READING (slowdown share) + year strip
                                · route face (prints data-k="geo.gain") · p.hero-dek · [Plan your {city}] [Watch the race ↓] · nav.course-toc
#at-a-glance      chapter-1    "What makes {city} {city}": three nugget rows in div.course-glance
#finish-times     chapter-2    median finish by year (scrub; "No race" gaps) · Values (CourseTable)
#elevation        chapter-3    shared-scale elevation + pace blocks (scrub) · dl.course-totals
#pacing           chapter-4    six type rows (glyph + colour + course vs all) · fingerprint vs typical
#slowdown         chapter-5    strip of every course, this course in signal
#goals            chapter-6    goal Segmented 3:00–5:00 · DotGrid · cells · "Every goal" table (#goals tbody th a, "Plan a {goal} {race}")
#weather          chapter-7    edition scatter · p.course-hotcool (≥ 5 °C) · p.course-slope
#plan             cta          Plan your {city}: Plan your race · Pace band · Check your splits (+ qualifying where QUALIFYING_COURSE)
#replay           (untracked)  RaceReplay field ↔ route (only courses with a replay; chunk lazy)
#other-courses    related      "Shaped like {city}": nearest fingerprints (≥ 5 editions), 3–5 rows with sparklines
                               then ChapterEnd (next card → chapter 09) and PageFeedback (.page-feedback)
```
- The SECTIONS and TRACK pins in `verify-courses --html` are unchanged.
- Every printed figure stays `<data value data-k>` through `Fact`.
- `ChapterEnd` renders **inside** `#other-courses` with `track={false}`, so the page keeps exactly one `related` section.
- Tables sit in focusable named regions.
- No rank words anywhere on the page.
- Phone length: **9 screens at most**.

### 4.4 Tool (`/tools/*`)

```
tool header   crumbs (Tools · group) · H1 (registry heading) · one-line purpose · EvidenceTag badges
.tool-workspace
  .tool-inputs     instrument panel cells (sticky left column ≥ 900)
  .tool-results    sr-only aria-live summary (first child) · result reading (night) · one data nugget (badged) · outputs · handoff rows
                   planner: <div data-track-section="result|comparison|pace-band" hidden=""> exactly as today
goal bar (phones, goal-driven tools)
ChapterEnd (chapter tools) | "More tools" + PageFeedback (reference tools)
```
- Inputs live in the URL through `useQueryState`, never birth dates.
- Every tool shows a full 4:00 example by default and has no submit button, as today.
- Phone length: **7 screens at most** in the default state.

### 4.5 Hub (`/research`, `/stories`, `/analyses`, `/tools`, `/courses`)

```
hero      H1 + dek (paper), optional reading
list      ChapterList (expanded) | NuggetCard grid | tool rows | course rows (sort chips)
reference block (research only): Tools · Courses · Methodology · Research archive · About
```
Phone length: **6 screens at most**. On `/courses`, at most 1.2 screens per 10 courses.

### 4.6 Runner and report (`/runners`, `/report`)

Noindex and never recorded (`REPLAY_BLOCKED_PAGES`). Every selector S3 pins is kept (§6.7). The report uses the lap-screen layout (§7.12). The runner page uses the instrument-panel search and the existing flow.

### 4.7 Prose and info (`/methodology`, `/about`, `/privacy`, `/request-analysis`, stubs, 404)

```
hero      crumbs · H1 · dek
body      36rem measure, Inter 17/1.6, H2 Fraunces --t-h2 (sentence case), H3 Inter 600 18
          methodology: "Jump to" chip bar (sticky, phones) + left rail (≥ 1180); <details> per topic; spec cards
footer
```

---

## 5. The nugget contract (`lib/nuggets/`, owned by WP0-C; area packages add entries)

Every headline number and every directional claim on the site comes from here. It runs on the server, at build, from the verified files: `lib/insights-server.ts`, `lib/research-data.ts`, `lib/fast-start-server.ts`, `lib/all-finisher-context-server.ts`, `lib/extension-data.ts` and the tool data readers.

```ts
// lib/nuggets/types.ts
export type NuggetId = `${string}.${string}`;          // 'kick.bank', 'home.negsplit', 'course.slowdown'
export type Nugget<V extends Record<string, number | string> = Record<string, number | string>> = {
  id: NuggetId;
  page: string;                 // '/analyses/starting-pace#hero'
  values: V;                    // raw values (seconds, shares 0–1, counts) — never pre-formatted
  guard: boolean;               // the direction/threshold the headline asserts
  headline: string;             // the sentence when guard holds (may contain one <em> span marker: *…*)
  fallback: string;             // neutral sentence when guard fails (never asserts direction)
  figure: { value: string; unit?: string; sr: string };   // formatted for the Reading/contents (units-aware variants below)
  key?: string;                 // short contents key (§2.2)
  term?: `/methodology#${string}`;
  denominator: 'eligible' | 'story' | 'shape' | 'kick' | 'demographics' | 'positions' | 'course' | 'tool' | 'none';
};
export type UnitsAware<T> = { mi: T; km: T };          // when a headline contains a pace/distance/temperature
```

- **Files.**

  | File | Nuggets |
  |---|---|
  | `lib/nuggets/core.ts` | `siteTotals()` and the format helpers |
  | `lib/nuggets/format.ts` | `inWords`, `approxWords`, `countWord`, `pct`, `time` (m:ss and h:mm:ss), `pace` (per mi / per km), `delta` (±m:ss), `ratio` (×), `temp`, `tempGap` (°F gap = °C × 9/5), `mats`, `sectionLabel` |
  | `lib/nuggets/home.ts` | the home page |
  | `lib/nuggets/stories.ts` | the stories, `/finish-times` and `/slowdown` |
  | `lib/nuggets/analyses.ts` | the analyses |
  | `lib/nuggets/courses.ts` | `/courses` and the per-city nuggets |
  | `lib/nuggets/tools.ts` | the tools |
  | `lib/nuggets/index.ts` | `getNugget(id, ctx?)` and `nuggetsFor(path)` |

- **Rendering.** A headline holds one `*…*` span, which `Reading` and `ChapterHeader` render as `<em>`. Units-aware headlines return both `mi` and `km` strings. The page renders them through `UnitText`, so the units switch and S1's placeholder check keep working. The page must be listed in `lib/unit-preference.ts`.
- **Guards.** These rules are mandatory:
  - **Never a literal selector.** No `city === 'London'`, `lo_min === 225`, `gap_lo_s === 60` or index `[3]`. Examples are chosen by `argmax` or `argmin` of the nugget's own value, or the row is looked up with `?.` and the nugget falls back when it is missing.
  - **Every extreme is filtered** to `n ≥ 100` (and `editions ≥ 3`, or 5 where stated). Editions held or excluded by `analysis/source_quality.py` are never named. That covers Chicago 2015, partly loaded, in the new release.
  - **Words that assert a size need numeric guards:** "nearly half" (≥ 0.45), "nearly a coin flip" (≥ 0.40), "every" or "all" (count === total), "mostly" (a majority), "N times" (`countWord(Math.round(r))`, only when r ≥ 2), "alike" (equal argmax).
  - **A null result** uses the `null` Reading variant and a "no clear difference" fallback.
- **Denominators.**
  - `siteTotals()` returns `{ results, finishesEligible, cities, raceYears, firstYear, lastYear }` from the runner manifest and the insights manifest. **One surface uses one family.** The home page and the contents use `finishesM()` for the "N million" figure.
  - A sentence about stories uses its story's own cohort. It never puts two totals side by side, and never puts 3.5 million and 3.4 million on the same screen.
  - `CohortNote`-style reconciliation copy lives only on `/methodology`.
- **Bootstrapping.** WP0-C ships a placeholder entry for every nugget id that `lib/chapters.ts` names. Each placeholder wraps the page's existing data-built sentence (the `lib/stories.ts` getters, `insightHeadline()`, `findingText()`, `courseDescription()`), with `guard: true`. That way the shell, the contents and the next cards work from day one. Each area package replaces its placeholders with real nuggets and their recounts. `verify-nuggets` lists any placeholder that remains, and WP9 fails if one is left.
- **The verifier** (`scripts/verify-nuggets.cjs`, new; added to `verify:data`) does three things:
  1. It loads `lib/nuggets` through the existing TypeScript require hook and recomputes every value **independently from the raw files**, using a second, deliberately simple implementation of each expression.
  2. It asserts that `guard` agrees with the recount and that the rendered headline matches `guard ? headline : fallback`.
  3. It asserts that no headline contains a banned word, a causal verb or a two-decimal mile figure.

  It runs on fixtures too (`--fixture`) to prove that every fallback renders.
- **OG cards.** `scripts/build-og-images.cjs` reads story titles, kickers and readings through `nuggetsFor()`, so a share image can never contradict its page. The palette tokens are unchanged.

---

## 6. Engineering plan

### 6.1 CSS architecture

**Today:**
- `app/globals.css` (927 lines) and `app/story.css` (634 lines) load on every page, 24.3 KB gzip together.
- Section sheets sit under `app/tools/`, `app/courses/[city]/`, `app/finish-times/` and `app/report/`.
- There is no layering and there are 30-odd breakpoints.

**Target tree:**

```
app/styles/
  fonts.css            @font-face (self-hosted woff2, unicode-range) + regenerated metric-matched fallback faces
  tokens.css           every custom property (§3.1–3.3); .night scope; [data-theme="dark"] scope (media block added in WP9)
  base.css             reset, html/body, element typography via :where(), links, focus, selection, motion var, utilities (.sr-only…)
  layout.css           .container, measures, .page-hero, .beat, .rail, page-template grids (§4)
  components/          one file per primitive, named after it: button, forms, segmented, chips, sheet, reading, receipt,
                       nugget-card, chart-frame, scrubber, dot-grid, ruler, values, table, tag, badge, guess, scrolly,
                       chapter-list, marker, next-card, reading-bar, header, menu, footer, feedback, share, replay, tool
  pages/               one file per area: home, story, analysis, course, courses, tools, report, runners, research, methodology, info
  legacy/              globals.css + story.css split mechanically BY OWNER (WP0-A, no visual change):
                       shared.css, home.css, stories.css, analyses.css, courses.css, research.css, info.css, packs.css
app/globals.css        becomes a 1-line comment + nothing (kept for git history) or deleted in WP9
```

- **Import order.** `app/layout.tsx` imports, in this order: `fonts`, `tokens`, `base`, `layout`, `components/*` (alphabetical), `pages/` (only the site-wide ones: home, research), then `legacy/*`. Section sheets keep being imported by their route layouts: `app/tools/layout.tsx`, `app/courses/[city]/page.tsx`, `app/report/layout.tsx` and `app/runners/layout.tsx`. Their legacy rules move into `app/styles/pages/<area>.css`, which those layouts import.
- **No `@layer`.** Safari earlier than 15.4 would drop layered rules entirely. The cascade is controlled by import order and low specificity: element rules in `:where()`, components with a single class, page overrides with at most `.page-x .component`. `!important` is allowed only in print and reduced-motion rules.
- **No hex in components.** Only `tokens.css` may contain colour literals. `scripts/verify-css.cjs` enforces this, along with the six breakpoints (§3.4) and a 12 px minimum font size in `components/chart-frame.css`, `scrubber.css` and the SVG text classes.
- **Fallbacks** for `color-mix()`, `:has()`, `subgrid`, container units and `linear()` easing sit behind `@supports`. `verify-compat` does not scan CSS, so `verify-css` does.
- **Migration rule.** When an area package rebuilds a page, it deletes that page's selectors from its own `legacy/<area>.css` in the same PR. WP9 deletes `legacy/shared.css` and the legacy token aliases once every area has landed.
- **Size target.** Global CSS of 18 KB gzip or less once legacy is gone (24.3 KB today). The only CSS that ships on every page is fonts, tokens, base, layout and the components.

### 6.2 Where the shared code lives

| Location | Contents | Owner |
|---|---|---|
| `components/ui/` | `Reading`, `Receipt`, `NuggetCard`, `BigNumber`, `MarkerBadge`, `ChapterHeader`, `ChapterList`, `Segmented.client`, `Chips.client`, `GuessFirst.client`, `Scrolly.client`, `Reveal.client`, `Sheet.client`, `MakeItYours.client`, `Values`, `Button`, `Arrow`, `Tag`, `ShareButton.client` | WP0-A (primitives) and WP0-B (`ChapterList`, `ChapterHeader`) |
| `components/viz/` | `ChartFrame`, `Readout`, `Axis`, `Gridlines`, `Scrubber.client`, `Annotation` and `labels.ts`, `DotGrid`, `Ruler`, `TypeGlyph`, `Histogram`, `BinLens`, `LineProfile`, `DotStrip`, `Dumbbell`, `ShareBar`, `Waffle`, `YearStrip`, `Scatter`, `EffectBand`, `ElevationPace`, `Waterfall`, `Cdf`, `Slope`, `GhostRace`, `useSize.ts` (kept), `RaceReplay` (rewritten), `ReplayPoster` | WP0-C |
| `components/` (root) | `SiteHeader`, `SiteNav`, `MenuSheet`, `ReadingBar.client`, `ChapterRail`, `ChapterEnd`, `NextCard`, `SiteFooter`, `PageFeedback`, `UnitsProvider`, `MotionToggle`, `KeypadHint`, `SectionTracker`, `SiteAnalytics` (unchanged) | WP0-B (`KeypadHint`: WP0-A) |
| `lib/chapters.ts` | the chapter registry (§2.3) | WP0-B |
| `lib/nuggets/` | the nugget contract (§5): core and format by WP0-C, the page files by the area packages | WP0-C, then the areas |
| `lib/share-image.ts` | the lazy share-card renderer | WP0-A |
| `lib/units.ts` | gains `sectionLabel(startKm, endKm)` → "0–5K" … "35–40K", "40K–finish"; `matLabel(km)`; one-decimal `distance()` for prose | WP0-C |
| `scripts/design/` | `shoot.cjs`, `interactions.cjs`, `lint-layout.cjs`, `sheet.py` (§8.0) | WP0-A |

**Delete in WP8** (dead code, unreferenced by any route): `components/HTWDashboard.tsx`, `components/charts/Fig1-6`, `components/tables/T1-4`, `components/FiltersBar.tsx`, `components/FigureCard.tsx`, `components/TableCard.tsx`, `hooks/useLiveData`, `context/FiltersContext.tsx`, `components/PacingPreview.tsx`, `components/PackClientPage.tsx` and `hooks/usePackMeta.ts`, `components/QuestionsHome.tsx`, `components/PersonalizedGuide.tsx` (with its route), and `components/QuestionLineChart.tsx` (once WP3 has replaced it with `LineProfile`).

### 6.3 Fonts

**WP0-A:**
1. **Copy the woff2 files.** `scripts/fonts/copy-fonts.cjs` copies these files from `node_modules/@fontsource-variable/*/files/` into `public/fonts/` (committed): Fraunces `latin` and `latin-ext` × `opsz-normal`/`opsz-italic`; Inter `wght-normal` for latin, latin-ext, cyrillic, cyrillic-ext, greek, greek-ext and vietnamese; Bricolage `wght-normal` for latin and latin-ext; JetBrains Mono `wght-normal` for latin and latin-ext.
2. **Write `app/styles/fonts.css`** with the `unicode-range` values from fontsource's CSS.
3. **Drop the five `@fontsource-variable` CSS imports** from `app/layout.tsx`. The npm dependencies stay until WP9.
4. **Preload** two files in `<head>`: `/fonts/fraunces-latin-opsz-normal.woff2` and `/fonts/inter-latin-wght-normal.woff2`.
5. **Regenerate the fallbacks.** Update `scripts/font-fallbacks.cjs` for the new families and settings. Title settings become `font-variation-settings: normal` with `font-optical-sizing: auto`; no SOFT or WONK. Then run it, and `--check` must pass (it needs the Liberation fonts).
6. **Check for third parties.** I1 must still find no third-party host. Every font URL is relative to the base path.

### 6.4 The JavaScript budget

| Change | Pages | Estimated change in initial gzip | Package |
|---|---|---|---|
| Recharts out: `WeatherAnalysis` becomes `EffectBand` (SVG), `RunnerContext` charts become `LineProfile` and `ShareBar`, `QuestionLineChart` becomes `LineProfile` | 13 analyses, `/runners`, `/slowdown`, 84 packs | **−99 KB** on the analyses and `/runners`; `/slowdown` and packs drop the lazy chunk | WP3, WP6 |
| Story bodies split through `next/dynamic` | 8 stories | −15 to −22 KB each (today every story ships 27.7 KB of all the bodies) | WP2 |
| Analysis explorers split by slug | analyses | −5 to −8 KB | WP3 |
| `RaceReplay` only where a replay renders | 21 course pages with no replay | −6.8 KB | WP0-C, WP5 |
| Root shell: `MenuSheet` (replacing the dropdown), `ReadingBar`, `ChapterLink` (adds `goal` to chapter links when the current URL has one). The chapter list is **server markup passed as props**, like today's brand and icon, so it costs no JS | every page | **+1.0 to +1.4 KB** (headroom on simple pages is 2.7–2.9 KB) | WP0-B |
| Charts are server SVG. Islands (gzip): `Scrubber` about 1.6, `Segmented` 0.5, `Chips` 0.4, `Reveal` 0.3, `GuessFirst` 1.2, `Scrolly` 0.7, `Sheet` 0.9, `MakeItYours` 0.6 | per page, as used | +1 to +4 KB on interactive pages (offset by the cuts above) | areas |
| Share renderer, `report-image`, replay data | — | lazy, so 0 initial | — |

- **Rules.**
  - An area package must keep every page it owns at or below **its WP0 budget figure + 1,536 B**, measured with `node scripts/verify-replay-e2e.cjs --only=S8` (no write).
  - Only WP0 (once, after the shell lands) and WP9 (finally) may run `--write-budget` and commit `scripts/e2e/budget.json`. Each records its reason in `note` and `measured`.
  - A package that needs more must say so in its PR, with the measured figure.
- **CLS.** CLS must stay ≤ 0.1 in the S8 lab. WP9 adds two pages to the S8 CLS list: `/stories/round-numbers` and `/analyses/starting-pace`. The rules that keep it there:
  - Chart boxes are reserved by CSS (aspect plus a cap).
  - Readouts keep a minimum height.
  - The replay keeps a fixed frame with its poster.
  - The header, reading bar, chip and sheet are fixed-position and move by transform only.
  - The font fallbacks are regenerated.
  - Content sits in the HTML at build (nuggets are server-side).

### 6.5 Analytics: section ids (the policy list is unchanged; usage is extended)

`TRACKED_SECTIONS` is unchanged. `lib/analytics-policy.ts` changes in one place only: `STORY_SLUGS` gains `'race-morning'` (WP2). There are no new events.

| Page | Ids, in DOM order | Change |
|---|---|---|
| `/` | `hero, paths, stakes, guide, steps, stories, cta` | none (verify-analytics and S6 pinned) |
| `/courses/[city]` | `hero, chapter-1 … chapter-7, cta, related` (the replay is untracked) | none (verify-courses pinned) |
| `/tools/plan` | `result, comparison, pace-band` | none (verify-tools pinned markup) |
| `/report`, `/runners` | `report` | none (regexes pinned) |
| stories, `/finish-times`, `/slowdown` | `hero, chapter-1 … chapter-n (n ≤ 6), related` | **new** (owner decision 5) |
| analyses | `hero, chapter-1 … chapter-4, related` | **new** |
| `/research` | `hero, analyses, related` | **new** |

`docs/ANALYTICS.md` lists the pages that are newly tracked. `home_depth@v1` counts `chapter-*` on `/` only, so it is unaffected.

### 6.6 Session replay masking: where each pinned class lives afterwards

| Token | Lives in | Note |
|---|---|---|
| `.home-plan` | `components/home/HomeDoors.tsx`, `<form className="home-door home-plan" action=… method="get">` | Markup regex-pinned; unchanged |
| `.tool-workspace`, `.tool-results` | every registered tool component | unchanged |
| `.analysis-layout` | `AnalysisExplorer`, `AllFinisherAnalysis`, `FastStartAnalysis`, `WeatherAnalysis` (still pinned per file), **plus** the page wrapper in `app/analyses/[slug]/page.tsx` | The page wrapper masks the chip, the sheet and the receipt's goal line |
| `.which-card` | `ArchetypeStory` (`WhichArchetype`) **and** `GuessFirst` root | A reused token, so `lib/replay-policy.ts` is not touched |
| `.finish-lookup` | `FinishTimeStory` (`#my-finish`) | unchanged |
| `.personalized-guide` | removed with `PersonalizedGuide` (WP8) | WP8 drops the per-file requirement in `verify-analytics`. The selector may stay in the policy, where it is harmless |
| `.projector-cards`, `.course-chooser-list` (+ `ph-no-capture`) | unchanged | |
| `ph-no-capture` placements | unchanged (RunnerSearch, RunnerContext, RaceReport, QualifyingChecker, SplitCheck, PaceBand, CourseChooser) | |
| `.viz svg`, `.replay` | every chart is in `figure.viz`; the replay keeps `.replay` | blocked from snapshots |
| status regions | literal `role`/`aria-live` attributes | Readouts and verdicts too |

No new masked class, no new storage key and no new `localStorage` or `sessionStorage` use (I6 unchanged). The goal reaches pages only through the URL query (`goal=`), as the tools already do. Analytics records the pathname only (`analyticsPath()`).

### 6.7 Selectors and copy that tests pin, and that the redesign keeps

- **Home (S1, S2, verify-analytics, verify-seo):**
  - `#hero-title`, `.home-hero-dek`, `.home-hero-copy`, `.hero-replay`
  - `#home-plan-course` (its options equal `#plan-course`), `#home-plan-goal` with the "Tap . for :" hint and dot-to-colon behaviour
  - `.home-plan-button` as the only `rgb(255, 91, 46)` control on the 390×664 and 402×714 first screens, with the title, the button and both `.home-door-link`s above the fold
  - `PlanFormUnits` hidden input only, `a.story-card`
- **Navigation:**
  - `#site-menu a`: the five links in exact order and text, then `.nav-more` (About, Request an analysis, Open data ↗) on phones only
  - exactly one `.nav-primary`; `.site-header .nav-toggle`; `nav.main-nav a[href=…]`; `footer a[href="/privacy"]`
  - the unit switch's markup and `button:has-text("Kilometres")`
- **Stories:** `#my-finish`, `.finish-lookup`, `.which-card input`
- **Analyses:**
  - "Finish time to explore", `.profile-refinements summary`, "Age group", "Recorded gender", /Earlier marathon/, /Update comparison/
  - `.analysis-pagination a`, `details.guide-optional`, /Previous marathon/, /Elapsed time/, /Latest 5 km/
  - the `QuestionViz` range classes, "No published values for this selection", `AnalysisChart` `<select aria-controls>`
  - fast-start and all-finisher pinned strings (§6.9)
- **Courses:**
  - `nav.course-toc a[href="#goals"]`, `#goals tbody th a` named "Plan a {goal} {race}"
  - `section.night` hero with `data-k="geo.gain"`
  - `.course-glance`, `.course-totals`, `.course-hotcool`, `.course-slope`, `.course-reason`, `.tool-table-wrap.course-table-wrap`, `.course-goals-table`, `.hero-dek`, `.page-feedback`
- **Tools:** every S2 label and id in `inventory.md` §3.15, `data-tool-controls` and `data-not-edit` placements, "Copy link", "Print wristband strips", "Print this plan", `MarathonHandoffs` copy, `#plan-headline-title` "4:00 in Berlin", "Save runner card", "Full result ↓", `#course-chooser-sort` / `-open`.
- **Runners and report:** every S3 selector, the `verify-report` markup, `.report-tracked`, and the 1080×1350 `pace-notes-race-report.png`.
- **Privacy:** "Turn off analytics", "Analytics is off for this browser.", `.page-feedback` buttons "Yes", "No", "Hard to follow" and "The numbers look wrong".

### 6.8 SEO

- **Metadata.**
  - `pageMetadata()` titles and descriptions stay unchanged for existing pages. New and merged pages get new ones of 60 characters or fewer for titles and 155 for descriptions, with no duplicates.
  - H1s change (analyses get finding H1s), with exactly one H1 per page.
  - Million counts come from `finishesM()`.
  - JSON-LD is unchanged: `WebSite`, `Article`, `BreadcrumbList`, `ItemList` and `Dataset`. Breadcrumbs gain the chapter: Pace Notes › Chapter 06 · The finish line › The 3:59 effect.
- **Sitemap and canonical URLs** (WP8): remove the warming, wind, personalized and alias stubs; add `/stories/race-morning`. Stubs carry noindex and canonical to their target.
- **Orphans.** `/research` links every story and analysis.
- **Methods anchors.** Every `howWeKnow` resolves. WP7 adds `#story-race-morning` and `#archive`.
- **`CONTENT_DATES`.** WP9 bumps it for every page whose visible text changed. That is nearly all of them.
- **OG cards.** WP9 re-renders `npm run og:images` (new titles, kickers and story) and `og:check` passes.

### 6.9 Verifier and e2e changes, and who makes them

The default rule: a verifier is edited by the package that owns the code it checks.

**Shared files** where several packages may edit only their own entries: `scripts/verify-analytics.cjs` (per-file token entries), `scripts/e2e/scenarios/s2-differential.cjs` (per-route cases) and `scripts/e2e/known-differences.json`. WP9 resolves any merge conflicts.

| Script | Change | Package |
|---|---|---|
| `verify-units.cjs` | Section labels become mat names ("First 5K", "0–5K", "40K–finish") in both modes; prose miles use one decimal; the placeholder and working-switch markup are unchanged | WP0-C |
| S1 `s1-browse.cjs` | The nav assertions are unchanged (the sheet keeps `#site-menu`). The `unitSwitch()` /research check changes: `#analyses` must hold a line with a pace in `/mi` that becomes `/km`, plus `?units=km`. WP7 provides the line (the pacing-pattern sub-row "35–40K at 9:49/mi") | WP0-B (nav, first screen, zoom: no changes expected); WP7 (`unitSwitch()` only) |
| `verify-ten-analyses.cjs` | `TEN_ANALYSES.length === 10` is kept. The headline regexes are re-pinned to mat-name grammar ("…split most in the 35–40K section…", "the second 20K ranged from…"). `METHOD_COPY` absence is kept. Each analysis HTML must contain its **question dek** | WP3 |
| `verify-fast-start-client.cjs`, `verify-all-finisher-context-client.cjs` | The pinned strings stay in the explorer copy. The numeric pins are refreshed by the release adoption, not by this redesign | WP3 |
| `verify-weather.cjs` | Renders `/analyses/race-day-weather` with its three tabs and `WeatherAnalysis` inside it. The two removed slugs come out of its route list. The uncertainty-interval wording is kept | WP3 |
| `verify-research.cjs` | The `figure.study-figure` count still equals the chart count on `/slowdown` and packs | WP3 |
| `verify-insights.cjs` | New story `race-morning` in the copy-field checks (no names, no release tags) | WP2 |
| `verify-finish-times.cjs` | Recounts the new beats (the women's-peak guard, the era arrows, the median-by-course strip) | WP2 |
| `verify-courses.cjs` | Sections, ids and classes are kept. It drops expectations for the removed pooled-profile `ResearchQuestion` and the "about this data" block, and adds checks for the three glance rows' guards | WP5 |
| `verify-tools.cjs` | The course chooser's default sort is "share under goal". The hue accents are removed. Badge markup is glyph plus word inside the same classes. `BANNED` is kept (so no projector validation on the page) | WP4 |
| `verify-report.cjs`, `verify-runner-search.cjs`, `verify-runner-context-ui.cjs` | Markup is kept. The Recharts removal is reflected in the render checks | WP6 |
| `verify-personalized.cjs` | The component-source checks go with `PersonalizedGuide`; the data checks are kept | WP8 |
| `verify-seo.cjs` | Sitemap counts, stubs, orphans and methods anchors | WP8 |
| `verify-analytics.cjs` | `STORY_SLUGS` gains `race-morning` (WP2). Per-file masked tokens: `GuessFirst` as `which-card` (WP0-A) and the analysis page wrapper (WP3). The `personalized-guide` entry is removed (WP8). Newly tracked pages are allowed | each its own entry |
| `verify-nuggets.cjs` (new) | §5 | WP0-C (harness), area packages (entries) |
| `verify-css.cjs` (new) | §6.1 | WP0-A |
| S2 | Analysis labels are inline from 900 px, so there are no changes at S2's 1280×900. Cases are re-recorded where markup outside masked regions moved (`known-differences.json`) | each package for its routes |
| S6 | `HOME_SECTIONS` unchanged. Its error-state regex must still match the new `ChartFrame` error copy ("could not load") | WP0-C |
| S8 | Budgets rewritten (WP0, then WP9). The CLS page list gains a story and an analysis | WP0, WP9 |
| `build-og-images.cjs` | Reads titles and readings through `nuggetsFor()`; adds the `race-morning` card. Its `TOKENS` are unchanged | WP9 |
| `font-fallbacks.cjs` | New faces and settings | WP0-A |
| `autopilot-smoke.cjs` | No change: H1s on every page and the error headings are kept | — |

### 6.10 Designing around fields, not numbers (the new release)

- **The new release changes:** 34 cities and 287 race-years, every value, and possibly the edition lists.
- **The release adoption, not the redesign, updates:** `COURSE_SLUGS` (the analytics literal), the home and planner course selects (the `home-form` check), `QUALIFYING_COURSE` and the course OG cards.
- **The redesign's job:**
  - every page reads nuggets with guards;
  - no body uses a literal city, label or index (`nuggets.md` §4 lists today's, and each owning package removes them);
  - ranges read their bounds from the data (for example the 2:15–7:00 improvement buckets, the courses with 5 or more editions);
  - the Chicago 2015 partly loaded edition, and any `source_quality` hold, is never named as a range end;
  - the duplicate-edition screen never appears in page copy.

### 6.11 Documents to update (WP9, from this spec)

`docs/DESIGN_SYSTEM.md` (rewritten from §3), `docs/WEBSITE_ARCHITECTURE.md` (chapters, CSS architecture, components), `docs/ANALYTICS.md` (tracked pages, menu sheet), `docs/SEO.md` (sitemap and stubs), `docs/TOOLS.md` (badges, course chooser default, goal bar), `docs/PROJECT_HANDOFF.md` (status, dated).

---

## 7. Page by page

**Notation.**
- `I/` = `public/data/insights/`, `P/` = `public/data/packs/`, `PG/` = `public/data/packs/ext_personalized_guide/`.
- `AF` = `public/data/all-finisher-context/evidence.json`, `FS` = `public/data/fast-start/all-finishers.json`, `ST` = `public/data/study/evidence.json`, `WX` = `public/data/weather/evidence.json`.
- Shards are found through `PG/summary.json` (`cities.find(c => c.city === 'All courses').file`, `.checkpoint_file`), never by position.
- **★** marks a page's reading.
- **G:** is the guard and **F:** the fallback.
- "Now" values are today's, for scale only.
- Each beat lists its id, its tracking id, its H2 finding, its data, and its form and interaction.

### 7.1 Home `/` (WP1)

**Template:** home, phone target 6 screens or fewer.

**1. Hero** (`section.night.bleed.hero.home-hero-band`, `data-track-section="hero"`, `aria-labelledby="hero-title"`)

*The replay band* (`div.hero-replay.replay`, full-bleed):
- **HUD:** the race name (mono 12 caps) and the clock (mono 28, tabular) on the left; "Finished x%" and "At slowdown pace y%" (mono 12 keys, Inter 600 values) on the right.
- **Canvas:** height `clamp(120px, 22svh, 200px)`, with a fallback of `22vh`.
- **Flag sentence** under the canvas: Fraunces 16/1.3, 2 lines, built from the `replay.first` nugget (§7.3).
- **Play/pause** 44 px in `--night-2`, top right of the canvas. **No race picker on the home page.**
- **Edition:** the argmax default (§3.6).
- **Measured budget at 390×664:**

  | Element | Height |
  |---|---|
  | Header | 56 |
  | Band | 36 + 146 + 44 |
  | Kicker | 16 + 18 |
  | H1 (3 lines at 36 px) | 112 |
  | Form | 14 + 64 |
  | Button | 10 + 52 |
  | Doors | 8 + 48 |
  | **Total** | **624 px, under 664 with 40 px spare** |

  At 402×714: 674 px. S1 must pass at both.

*The copy* (`div.home-hero-copy`):
- **Kicker:** "{cities} city marathons · {firstYear}–{lastYear}", from `siteTotals()`.
- **H1** `#hero-title`: "The same 26.2 miles, run *{finishesM()} million* ways." `MarathonDistance` keeps "26.2 miles" in miles mode and gives "42.2 km" in km mode.
- **Dek** `p.home-hero-dek` (shown from 600 px): "Pick a course and a goal. See how finishes at that pace held up there."

*Paths* (`HomeDoors`, `data-track-section="paths"`):
- The form markup is unchanged: `form.home-door.home-plan` with `action="/tools/plan" method="get"`.
- **Panel:** one instrument row on `--night-2` with a 1 px `--night-3` border and `--r-sm`. It holds two cells: Course (`#home-plan-course`) and Goal (`#home-plan-goal`, `inputMode=decimal`, `KeypadHint` "Tap . for :"), plus `PlanFormUnits`.
- **Button:** `.home-plan-button` "Plan your race", full width, 52 px, accent.
- **Doors:** two `.home-door-link`s side by side from 360 px, stacked below: "Analyze a past race" (`/runners`) and "Read it start to finish" (`/finish-times`). Each is 48 px, `--night-ink` text with a 1 px `--night-3` border.

*Desktop (900 px and up):*
- Copy and form on the left (5/12); the replay on the right (7/12), full hero height, radius 16, with the race chip row (Segmented) under it.
- The replay sits above the title on phones only.

**2. Stakes** (`#stakes`, `data-track-section="stakes"`, paper)
- **GuessFirst** (the page's one guess):
  - Question: "What share of finishes ran their second 20K faster than their first?"
  - Slider 0–60, read as "of 100".
  - Reveal on a DotGrid: truth `--signal`, guess as rings.
  - Verdict: "You guessed {g}. Only about *{inWords(share)}* did."
  - Data: `P/ext_pacing_shapes/tables/patterns.csv` row `label === 'Faster second 20 km'` `value`. Now 3.9%, so "1 in 25".
  - G: share < 0.5 for "Only". F: "About {inWords} did."
  - Link: "Chapter 03 · The shape of a race →".
- **Reading:**
  - Figure: `pct(ST.rate)` "30%", with the unit line "of finishes".
  - Sentence: "About *3 in 10* finishes had a sustained slowdown. Just over 7 in 10 of those began at 30K or later." The second sentence comes from `ST.timing.charts[0].rows`, labels 30 and 35 summed over n. Both fractions come from `approxWords()`. G: the 30K-or-later share ≥ 0.5. F: "{x}% of those began at 30K or later."
  - Instrument: a ShareBar of onset by section (20K, 25K, 30K, 35K), with 30K and 35K in signal.
  - Link: "Chapter 05 · After 30K →".
- **Removed:** the DOI link, the three pinned stat cards (3,414,116 / 29 / "2021") and the denominator-reconciliation paragraph.

**3. Guide** (`#guide`, `data-track-section="guide"`)
- H2: "The race, *start to finish*."
- Dek: "Eleven chapters, each a stretch of the marathon and the one thing the data says about it."
- `ChapterList` in its `full` variant: three part headings and 11 rows with their readings.

**4. Steps** (`#steps`, `data-track-section="steps"`)
- H2: "Plan in *three* steps."
- Three numbered rows on a vertical hairline: Pick a course and a goal → See how finishes like yours held → Print a pace band.
- A secondary button, "Plan your race" (not orange: the primary sits in the hero).

**5. Stories** (`section#research`, the id is kept; `data-track-section="stories"`)
- H2: "Eight things *{finishesM()} million* finishes say."
- A progress strip (8 segments, the current one in ink) above a horizontal scroll-snap deck of 8 `a.story-card` NuggetCards, one per story in chapter order.
- Each card shows that story's reading and micro-viz.
- From 1180 px the deck becomes a 4×2 grid. Arrow buttons (44 px) appear from 600 px.

**6. CTA** (`section.night.bleed.cta-band-wrap`, `data-track-section="cta"`)
- A checkered top rule.
- The pixel `RunnerLane` with time chips "3:30 · 4:00 · 4:30", running once and settling after 30 s.
- H2: "Your next marathon starts with *a plan*."
- "Plan your race" (accent) and "Make a pace band" (secondary).

**Contract notes:**
- `assertCohortTotals()` stays on the page.
- The study versus summary `n` build check stays.
- JSON-LD `WebSite`.
- The Berlin replay literal is replaced by the argmax default.

### 7.2 Contents `/research`, plus `/stories` and `/analyses` (WP7)

**`/research`** (hub; `hero`, `analyses`, `related`):

*Hero:*
- H1 "The race, *start to finish*."
- Dek: "Every chapter, every page, and the one thing each found."

*The list* (`section#analyses`, `data-track-section="analyses"`):
- `ChapterList` in its `expanded` variant: all 11 chapters, each with its pages as sub-rows (title, kind tag and reading).
- The **pacing-pattern sub-row reading is units-aware and is the S1 hook:** "35–40K at {pace}/mi" becomes "…/km".
- Every story and every analysis is linked here (the orphans rule).

*Reference block* (`related`):
- Tools, Courses, Methodology, Research archive (`/packs`) and About, as 52 px rows.
- "Request an analysis" as a tertiary link.

*Removed:* the cohort paragraph, the methods, open-data and data-source blocks (now on `/methodology`), the weather extras list and the supporting-study card.

**`/stories`:**
- H1 "Stories". Dek: "Eight long reads, one per stretch of the race."
- A grid of 8 NuggetCards in chapter order (1, 2 or 3 columns). Each links to its story.
- Phone target: 3 screens.

**`/analyses`:**
- H1 "Analyses". Dek: "Answers first. Then make each one yours."
- A list of 11 analyses (`/analyses/race-day-weather` counted once) as `ChapterList` sub-row-style rows: chapter badge, title (the finding H1, not the old question), the reading, and a link.
- Then the "Request an analysis" callout.

### 7.3 Chapter 01 START · The field

**`/finish-times`** (WP2; story template; `main[data-reading]`; `howWeKnow` `#finish-times`)

**★ Reading:**
- Figure `time(groups.all.median)` "4:10", unit "median finish".
- Sentence: "Half of all finishes took longer than *4:10*. Recorded women's median was 4:31, men's 3:59."
- Data: `getFinishTimeSummary().groups[g].median` (nearest-rank over `I/finish-times.json` histogram, with the `cohort` totals).
- Instrument: a Ruler from p10 to p90 with three medians (All in signal; Women and Men in ink with labels).

| # | Id | Track | H2 (guarded) | Data | Form and interaction |
|---|---|---|---|---|---|
| 1 | `#field` | chapter-1 | "Most finishes land between *{p25}* and *{p75}*." | `groups.all` p25 and p75 (nearest rank) | DotStrip of 100 dots at the 1st–99th percentile finish times. Segmented All / Women / Men morphs the strip, with the median dot labelled |
| 2 | `#peak` | chapter-2 | "Women's median is 4:31, yet their busiest minute is *3:58*." | `argmax(histogram, h => h.women).minute` against `groups.women.median`. G: peak < 240 && median > 240. F: "Women's busiest minute is {peak}; their median is {median}." | Histogram silhouette (women) with the median line and the peak tower in signal. Segmented Women / Men |
| 3 | `#front` | chapter-3 | "Since 2019 the front got *7 minutes faster*. The back didn't move." | `I/courses.json → years.eras.summary.p10.change`, `.p10.ci95`, `.p90.change`, `.p90.ci95`, and the count of courses faster. G: `p10.ci95[1] < 0` && `p90.ci95` straddles 0. F: "The 10th-percentile finish changed by {x} min; the 90th by {y}." | Era arrows: two arrows per course (p10, p90; 2015–19 → 2022–26). The p10 arrows slide left together on reveal; the p90 arrows stay short. Values |
| 4 | `#by-race` | chapter-4 | "Median finish, race by race: *{min}* to *{max}*." | `I/courses.json → courses[].median` (n ≥ 100). The course names come from data | A ranked DotStrip. Each dot is an `<a>` to `/courses/[city]` (44 px hit). Values lists all races with links, which replaces the 2-column link list |

- **Removed:** "What these numbers cover" (method), the open shares and percentile tables (now in Values), and the under-3:00/4:00/5:00 shares (they live on `/analyses/finish-time-context`).
- **Contract:** `verify-finish-times` recounts every number. The page is in `UNIT_SECTIONS`.

**`/stories/race-replay`** (WP2; "Watch a marathon unfold"; `#story-race-replay`)

**★ Reading** (`replay.first`):
- Figure "47%". Unit line: "of the field had not reached 20K when the first runner finished".
- Sentence: "When the first {race year} finish crossed the line, *{share}* of the field had not reached 20K."
- Data: `editions[i].moments.not_past_20_at_first / editions[i].finishes`, with `i = argmax`. G: say "nearly half" only if ≥ 0.45. F: the plain share.
- **H1:** the `lib/stories.ts` title getter, rewritten as a finding: "When the first runner finished, *{share}* of the field hadn't reached 20K." Say "20K", never "halfway": no halfway timing is recorded. If the guard fails, the H1 falls back to "Watch a marathon unfold".

| # | Id | Track | H2 | Data | Form |
|---|---|---|---|---|---|
| 1 | `#replay` | chapter-1 | "{race}: the whole field on one clock." | `replay.json` plus the browser fetch of `replay/<slug>.json` | `HeroReplay`: Segmented "The field \| On the route", race Chips (scrolling, edge fade), play and scrub, speed Segmented (1× 3× 10×). **The signature beat; no scrolly here.** |
| 2 | `#first` | chapter-2 | "In every race, part of the field was still before 20K at the first finish." G: all > 0 | `editions[].moments` | DotStrip of editions by share. Tap one to load it into the replay in beat 1 |
| 3 | `#ghost` | chapter-3 | "Real 4:30 finishers reached 20K *5 to 9½ minutes* ahead of an even 4:30." | `editions[].ghosts.find(g => g.target_s === nearest target to 16200 present)`: `even_20km_s − typical_20km_s`, min and max across editions. G: every edition has typical < even | GhostRace scrubber (even ghost against the typical runner) with race Chips |
| 4 | `#emptying` | chapter-4 | "Late in the race, the slower pace on course is mostly *who's left*." | `editions[].composition.find(r => r.clock_s === nearest of the available clocks to 18000).composition_share`. G: > 0.5 | ShareBar split "who's left" and "slowing", morphing on reveal. Race Chips |
| 5 | `#packs` | chapter-5 | "Same 10K split, *{window} minutes* apart at the finish." | `editions[].pack.n`, `.finish_window_min` (edition by argmax) | GhostRace-style fan: 30 dots leave the 10K mat together and spread to the finish, scrubbed by the clock |
| 6 | `#spread` | chapter-6 | "In all {n} editions, the field spread out more after 20K than before." G: `wider_after_20 === editions.length` | `stretch` | One-line Ruler or strip |

- **Removed:** `#snapshots` (8 small multiples) and the 10 JSON links.

### 7.4 Chapter 02 5K · The first 5K

**`/analyses/starting-pace`** (WP3; `#fast-start-method`)

**H1** (`kick.bank`):
- "A first 5K over 10% fast banked 2:42, and *finished 5:00 behind*."
- Data: `I/kick.json → bank.bands.find(b => b.label === 'More than 10% faster')` with `open_s`, `after20_s`, `finish_s`, `slowdown` and `expected`. Find the label by its band key; if absent, F.
- G: `open_s < 0 && finish_s > 0`. F: "How a fast first 5K finished, against the same pace."

**Dek:** "What happens after a very fast start?"

**★ Receipt (night):**

| Row | Value |
|---|---|
| First 5K | −2:42 ahead of the same pace |
| After 20K | +7:42 behind |
| At the finish | 5:00 behind (signal) |
| Sustained slowdown | 54%, against 37% typical for the race and pace (inline Ruler) |
| Footer | "Same race · same 5–20K pace" |

**Goal line:**
- "At *{goal}*, more than 10% fast is a first 5K under {t10}. Even: {tEven}."
- `t10` comes from the band threshold helper in `lib/fast-start.ts`.
- `goal` defaults to 4:00 or comes from `?goal=`. A `[Change]` button opens the sheet.

**Beats:**

| # | Id | Track | H2 | Data | Form |
|---|---|---|---|---|---|
| 1 | `#sweet-spot` | chapter-1 | "The best average finish came after a first 5K *2–3% slower* than the pace that followed." Phrase as "went with", never "came from" | `bank.curve` argmin of `finish_s`, giving the range `lo` to `lo+1`. G: `lo > 0` for "slower". F: "The best average finish went with a first 5K {range} {faster/slower}." | **GuessFirst** ("Where was the sweet spot?", Chips: 10% fast … 10% slow; Skip). Then the U-curve scrub, with the slowdown-share chart sharing its x axis. Detents at even, best and 10% fast; the default needle at the best point. Cells: 5K · after 20K · sustained slowdown |
| 2 | `#onset` | chapter-2 | "When a fast start had a sustained slowdown, *30%* began in the 20–25K section. After a steady start: 4%." G: fast share > steady share | `FS → rows.find(All courses/all/all).groups.find(band === 'fast10').onset[0]/Σ` and the same for `steady` | ShareBar per band. Chips for the six opening bands re-fill it. The 20–25K segment in signal |
| 3 | `#openings` | chapter-3 | "The faster the first 5K, the more often a sustained slowdown followed." G: monotone across bands, else F "Sustained slowdown by opening, against what was typical" | `bank.bands[].slowdown` against `.expected` | Dumbbell list of six rows: hollow expected, filled observed |
| 4 | `#explore` | chapter-4 | "Make it yours." | `FastStartAnalysis` (FS, evidence) | Mode Segmented: "All eligible finishes" (`aria-pressed`) / "With an earlier result". Course, age, gender and opening in the sheet (inline from 900 px). The pinned strings are kept verbatim |

- **Removed:** about 1.5 screens of selects before the answer, the amber caveat, sections 01–04 captions and the raw 49.6% headline. The raw contrast is shown only inside the explorer.
- **Copy rule:** the matched result (`kick.bank`) leads. `ext_opening_tradeoffs` (a different question) is never shown here.

**`/analyses/downhill-start`** (WP3; `#all-finisher-context`)

**H1:**
- "A downhill start didn't mean a *faster opening*."
- Data: Σn for `downhill:fast10` and `downhill:fast5` over Σn for `downhill:*`, against the same for `other:*`, from `AF → rows[All/all/all/all].downhill`.
- G: |difference| < 2 points. F: "{a}% of downhill-start finishes opened more than 5% fast; elsewhere {b}%."

**★ Answer (night):** two DotGrids, "Downhill-start courses {a} · Other courses {b}" of 100 finishes opening more than 5% fast. "Downhill-start" is the courses whose first 5K nets −25 m or less, named from `editions` ("three courses").

**Beats:**

| # | Id | Track | H2 | Data | Form |
|---|---|---|---|---|---|
| 1 | `#by-band` | chapter-1 | "Within each opening band, the downhill-start courses had fewer sustained slowdowns." G: holds in all 6 for "each"; otherwise "in {k} of 6 bands" | `downhill:<band>.slowdown_pct` against `other:<band>` | Dumbbell, six rows |
| 2 | `#explore` | chapter-2 | "Make it yours." | `AllFinisherAnalysis kind="downhill" archive` | sheet or inline |

**Removed:** the 2.3 screens of controls before the answer.

### 7.5 Chapter 03 10K · The shape of a race

**`/stories/pacing-types`** (WP2; "Six ways to run the same race")

**★ Reading:**
- Figure "1 in 25". Unit line: "ran their second 20K faster than their first".
- Data: `P/ext_pacing_shapes`, as on the home page. This page can read packs at build through `lib/extension-data.ts`.
- Instrument: a row of six TypeGlyphs with their shares.

**H1** (title getter): "Six ways to run *the same race*". "Six" is `countWord(archetypes.length)`.

| # | Id | Track | H2 | Data | Form |
|---|---|---|---|---|---|
| 1 | `#six` | chapter-1 | "Same finish time, *{countWord(n)}* journeys." | `archetypes` | ArchetypeRace. **Fix:** each runner's label rides with it, so a still frame reads. ArchetypeCards carousel with page dots (`scroll-snap`) |
| 2 | `#river` | chapter-2 (**Scrolly**) | "Even pacing fades with the clock: *63%* of 2:30–2:45 finishes, *7%* of 6:15–6:30." | `river[0].shares[m]`, `river.at(-1).shares[m]` (`m` = index of slug `metronome`). **`at()` is banned (S5)**: use `[len − 1]` | Scrolly: 4 steps (all six streams → the Metronome highlighted → the narrowing labelled → the Late-fader share of slowdowns: "16% of finishes, 43% of sustained slowdowns") |
| 3 | `#barcode` | chapter-3 | "Every finish, one stripe: the red arrives *earlier* for slower finishes." G: the onset moves monotonically | `barcode` | Barcode heatmap (`PACE_RAMP`) with a finish-time scrubber framing the row. Fix the bin count: `100 / data.barcode.length` |
| 4 | `#gender` | chapter-4 | "At the same finish times, men's finishes were Cliffs *{countWord(round(r))} times* as often." G: r ≥ 2. F: "Cliffs: {w}% of women's finishes, {m}% of men's." | `gender.men.standardized_shares[c] / gender.women…[c]` | Dumbbell of the six types, with the women/men legend **at the top**, direct-labelled on the first row |
| 5 | `#habits` | chapter-5 | "After a Cliff, the next race was a Cliff again *13%* of the time: 4× its usual share." | `transitions.rows[c].repeat_share`, `/ overall_share` | Transition grid. Tap a type to light its row |
| 6 | `#you` | chapter-6 | "Which runner were you?" | classifier | `WhichArchetype` (`.which-card`, masked): nine mat boxes, result as a TypeGlyph plus its share. **No GuessFirst on this page** (S2 `.which-card input`) |

- `#courses` (where steadiness is common) moves into `/stories/courses` beat 1 as a strip; the anchor stays as an alias `<span id="courses">` on `#six`.
- **Removed:** the method box, the 29-row alphabetical type-by-course list and the clipped tabs.

**`/analyses/pacing-pattern`** (WP3)

**H1:**
- "4:00 finishers didn't run 4:00 pace: *{fast} fast* early, {slow} slow late."
- Units-aware: in miles "26 s/mi fast early, 40 s/mi slow late"; in km "16 s/km … 25 s/km".
- Data: `PG/<All courses>.cohorts['all|all|all'].profiles['240'].pace[i][1]` for `i` = 1 and 7, against the even pace `G·60/42.195`.
- G: `pace[1] < even < pace[7]`.

**Dek:** "How do runners near my time pace the race?"

**★ Answer (night):** a LineProfile of the median line with its p25–p75 band against even pace (dashed), and "here the clock turns" labelled at the crossing.

| # | Id | Track | H2 | Data | Form |
|---|---|---|---|---|---|
| 1 | `#goals` | chapter-1 | "The same shape at every goal." | `profiles[target]` for 180–300 | Goal Segmented 3:00 · 3:30 · 4:00 · 4:30 · 5:00 morphs the line |
| 2 | `#spread` | chapter-2 | "The middle half spans *{a}* at the start and *{b}* by 35–40K." | `pace[i][2] − pace[i][0]` for `i` = 0 and 7 | The band width labelled at both ends |
| 3 | `#types` | chapter-3 | "Of finishes near 4:00, {x}% were Metronomes." | `I/archetypes.json → river` (the band containing 240) | A mini ShareBar of types, linking to chapter 03's story |
| 4 | `#explore` | chapter-4 | "Make it yours." | `AnalysisExplorer` | sheet or inline: Course, "Finish time to explore", refinements, "Update comparison" |

### 7.6 Chapter 04 HALF · Halfway to 30K

**`/analyses/checkpoint`** (WP3)

**H1:**
- "On even 4:00 pace at 30K, only *13%* got under 4:00."
- Data: the checkpoint shard row with `checkpoint === 30`, `trend === 'all'`, `age = gender = 'all'` and `elapsed` band containing `240·30/42.195`. Share = `cdf[240 − cdf_min] / n`.
- G: < 0.5. F: "{x}% of finishes on even 4:00 pace at 30K got under 4:00."
- **The default is computed at build:** the server reads the checkpoint shard (new code in `lib/analysis-server.ts`).

**Dek:** "What can my checkpoint time tell me?"

**★ Answer (night):** a DotGrid of 13 lit in 100. Cells: "Median finish 4:07:55" and "On even pace = 2:50–2:52 at 30K".

| # | Id | Track | H2 | Data | Form |
|---|---|---|---|---|---|
| 1 | `#cushion` | chapter-1 | "Half made 4:00 from about *{x} minutes* ahead of even pace at 30K." | The latest elapsed band with share ≥ 0.5, interpolated | Scrubber over the 30K elapsed time. Readout: "At 2:45 at 30K: 63% got under 4:00". Detents at even and at the 50% point |
| 2 | `#trend` | chapter-2 | "Same 20K time: speeding up went with *{a} minutes* sooner; slowing, {b} later." | `P/ext_pace_trend_at_20k/summary.json → statistics.accel_diff`, `.slow_diff` | Three runner chips fanning out to three finish times (GhostRace-lite) |
| 3 | `#slips` | chapter-3 | "First behind the 4:00 budget at 25K: *{x}%* still got under 4:00." | `P/ext_goal_slip_recovery/tables/slips.csv` (target "Under 4 hours", label 25, and label 40) | Ruler with two marks (25K and 40K) |
| 4 | `#explore` | chapter-4 | "Make it yours." | `CheckpointExplorer` | Mat (20/30/35), /Elapsed time/, /Latest 5 km/, `details.guide-optional` /Previous marathon/. Pre-filled, never empty |

**`/stories/places`** (WP2; "Pass or be passed")

**★ Reading:**
- Figure "42%".
- Sentence: "Trailing by 60–90 s at 30K, a finish still *crossed first* {x}% of the time. From 40K: {y}%."
- Data: `coin_flip['30'].find(r => r.gap_lo_s === <the band nearest 60 present>).share`, and the same for `['40']`.
- G: x ≥ 0.40 for "nearly a coin flip" in the H1 title getter.

| # | Id | Track | H2 | Data | Form |
|---|---|---|---|---|---|
| 1 | `#gap` | chapter-1 | "A minute back at 30K is *close to a coin flip*. At 40K it isn't." | `coin_flip` | Scrubber over the gap (0–5 min), with a Segmented 30K / 40K. **The signature beat** (`GapGauge` restyled as a ChartFrame line) |
| 2 | `#break-even` | chapter-2 | "Slowing up to about *{x}%* after 30K still tended to gain places." | `breakeven_crossing`, `breakeven[]` | Scrubber along the break-even curve. Readout: "+N places per 100" |
| 3 | `#shuffle` | chapter-3 | "57% moved up after 30K, but sinkers outnumbered surgers *3 to 1*." | `gained_share`, `sinker_share / surger_share` | The receipt Ledger (the places receipt, the origin of the Receipt) |
| 4 | `#gains` | chapter-4 | "The losses have a long tail." | gain histogram | Asymmetric histogram |
| 5 | `#women` | chapter-5 | "Recorded women gained on men after 30K in *all {n}* editions compared." G: equal | `women_ahead_editions`, `gender_editions.length` | 177 ticks (barcode-lite) |

- **Copy:** at most 900 words (1,945 today). Each beat's dek is 2 sentences or fewer.

**`/tools/projector`:** §7.13 (tools).

### 7.7 Chapter 05 30K · After 30K

**`/slowdown`** (WP3; explainer, story template; `#slowdown-method`)

**H1:** "Sustained slowdown: *when* it begins, and where."

**★ Reading:**
- Figure "72%". Unit line: "of sustained slowdowns began at 30K or later".
- Data: `ST.timing.charts[0].rows` (labels 30 and 35 summed, over n).
- Instrument: a course line with four onset flags (20, 25, 30, 35K) whose heights are the shares.

| # | Id | Track | H2 | Data | Form |
|---|---|---|---|---|---|
| 1 | `#threshold` | chapter-1 | "At 25% slower for 5K, {x}% qualify. At 10% slower, *two-thirds* would." | `figures.find(id === 'sensitivity').charts[0].rows` (length "5 km") | Scrubber over the threshold (10–40%), with the share as a big live readout. Detent at 25% labelled "the definition". Term link |
| 2 | `#courses` | chapter-2 | "Sustained slowdown ran from *{min}* to *{max}* of finishes, course by course." No names in the sentence | The `courses.spread` nugget (AF, the same as course-comparison's H1 and the chapter 08 key), filtered `n ≥ 100` | DotStrip (extremes labelled on the dots, owner decision 7). Tap → the course page |
| 3 | `#history` | chapter-3 | "An earlier best under 3:00: *{a}%* had a sustained slowdown. 4:00 or longer: {b}%." | `figures.find(id === 'history').charts[0].rows` | Four stepped columns |
| 4 | `#after-best` | chapter-4 | "The race after a recorded best had more sustained slowdowns ({a}% vs {b}%)." Phrase carefully: no "because" | `history.charts[1]` labels 1 and 0 | Ruler |

- **Removed:** the definition-led opening, the DOI link, the landmarks figure and the alphabetical list.
- **Contract:** `ResearchQuestion` and `StudyFigure` keep `figure.study-figure` (verify-research).

**`/stories/final-kick`** (WP2; **retitled**)
- **Kicker:** "After 30K".
- **H1:** "Same pace to 20K, *{min} minutes* apart at the finish."
  - Data: `cost.stratified.median_gap_s` → minutes.
  - G: > 600 s. F: "Same pace to 20K, apart at the finish."
- **★ Reading:** figure "20 min". Sentence: "Finishes with the same race, recorded gender and 5–20K pace: those with a sustained slowdown finished a typical *{gap}* later."

**Beats, in race order:**

| # | Id | Track | H2 | Data | Form |
|---|---|---|---|---|---|
| 1 | `#twins` | chapter-1 | "Two finishes, 3 seconds apart at 20K, *{x}* apart at the end." | `cost.bands` (the band whose 20K medians are closest; not the literal 225) | TwinRunners GhostRace with a split board. **The signature beat** |
| 2 | `#warning` | chapter-2 | "Already 15–20% slower at 25–30K: *{x}%* went on to a sustained slowdown. Faster than early pace: {y}%." | `warning.find(w => w.after === <label for the 25–30 section>)` rows | Chips for six "how much slower" levels; a warning-light Ruler (the skeuomorphic gauge goes) |
| 3 | `#states` | chapter-3 | "No second wind: once 25% slower, the next 5K stayed that slow *{x}%* of the time." | `recovery.stay[].stay`, `states.flows` | Section columns (states), 5 columns. **This replaces the dense alluvial** |
| 4 | `#break` | chapter-4 | "Where the break came." | `break` | BreakRiver restyled |
| 5 | `#magnet` | chapter-5 | "Even so, *3 in 4* finishes sped up over the last 2.2K." | `kick.share`, `magnet.slice(0, -1)` min and max | Five columns, the last rising, with the runner glyph leaning on it. Then a two-row "but only {x}% got back to early pace" Ruler |
| 6 | `#women-men` | chapter-6 | "Recorded women out-kicked men at nearly every pace." G: exceptions ≤ 1 band, named | `gender_kick` | Dumbbell per pace band, with the exception band marked |

- **Moved:** `#bank` goes to starting-pace and `#follows` to finding-improvement. Anchor stubs `<span id="bank">` and `<span id="follows">` hold a one-line link to the new home, so old deep links still land somewhere.
- **Removed:** the method box and the skeuomorphic gauge.

**`/analyses/where-time-is-gained`** (WP3)

**H1:**
- "Just over and just under 4:00 were {gap} apart. *{share}* of it opened after 20K."
- Data: `d_i = above.durations[i] − below.durations[i]` from `PG/<All>.cohorts['all|all|all'].near.find(n => n.target === 240)`; Σd and `Σd[4..7] / Σd`.
- G: share > 0.5.

**Dek:** "Where is a target time won or lost?"

**★ Answer (night):** a Waterfall of 9 bars. 35–40K is labelled with the largest gap; the first bar is called out ("already {d0} by 5K").

| # | Id | Track | H2 | Data | Form |
|---|---|---|---|---|---|
| 1 | `#goals` | chapter-1 | "The same late gap at 3:00; at 5:00 it spreads out." | the same expression at 180 and 300 | Goal Segmented redraws |
| 2 | `#explore` | chapter-2 | "Make it yours." | `AnalysisExplorer` | sheet or inline |

**Removed:** the 18 mono-caps row labels (now a two-colour key plus direct labels) and the tautological count headline.

### 7.8 Chapter 06 FINISH · The finish line

**`/stories/round-numbers`** (WP2; "The 3:59 effect"; reference R08–R11)

**★ Reading (C):**
- Figure "1.73×". Unit line: "the smooth curve, in the minute before {mark}".
- Sentence: "Between 2:59:00 and 2:59:59, *{n}* finishes landed: *{ratio} times* what a smooth curve expects."
- Data: `marks` argmax of `ratio` → `.mark`, `.minute_before`, `.ratio`, and the count. G: ratio > 1.1. The minute is computed as mark − 1, never the literal "2:59".
- Instrument: a 64 px mini lens.

| # | Id | Track | H2 | Data | Form |
|---|---|---|---|---|---|
| 1 | `#towers` | chapter-1 (**Scrolly**, the signature beat; A) | Step texts: (1) "Every finish, minute by minute: the busiest is *{peak}*." (2) "A smooth curve says where finishes should fall." (3) "The minutes before each hour and half-hour stick up." (4) "The busiest minute, {peak}, is a crowd. *Against the curve*, the tallest is {minute_before}." (5) zoom 2:45–3:15: "{ratio}×: {n} finishes where the curve expects {expected}." | `I/finish-times.json` histogram, `marks`, `argmax(histogram.all)`. "for women and men alike" only if the three argmax values are equal | Scrolly over the Histogram silhouette, 5 steps. **It ends unpinned as a scrubbable lens chart** with the Segmented "Finishes per minute \| Against the curve" (C), the readout and detents at the marks. This bridges "the busiest minute 3:58" and "the tallest against the curve 2:59" in one beat |
| 2 | `#scoreboard` | chapter-2 | "Hours and half-hours pull. *Quarter-hours* mostly don't." G: a majority of quarter ratios < 1.05. F: "Hours and half-hours pull hardest." | `marks[]` | Ranked lollipop of the 11 marks on a 1× line, with hours and half-hours in ink and quarters quiet. Tap a row → the readout. Values (no clipped table) |
| 3 | `#seconds` | chapter-3 | "Before slower marks, the pile sits further under the line: *{min_offset}* before {mark_min}." G: the cushion is widest at the slower mark | `seconds[].peak_offset_s`. **The default Segmented mark is the mark the H2 names** | BinLens with mark Segmented |
| 4 | `#rescue` | chapter-4 (**GuessFirst**, the page's one guess) | Question: "At 40K a finish is on course for 0–2 minutes over 4:00. What share still got under?" Reveal: "*{x}%* did; away from a round mark, {y}%." G: x > y | `bubble.find(b => b.minutes === 240).over.share_under`, `.expected_share_under` | GuessFirst on a Ruler plus two cells. Mark Chips re-run it at 3:00–5:00 (C) |
| 5 | `#my-finish` | chapter-5 | "Where did *your* finish land?" | the histogram | `.finish-lookup` (masked) `#my-finish` time field with keypad. The needle and "you" ring on the histogram. Readout: "{minute}: {n} finishes, {r}× the curve". Share button (goal opt-in) |

- **Removed:** the clipped scoreboard table, the method box and the duplicate landmarks figure (now only here).
- **Target:** 9 screens or fewer (the scrolly takes 3).

**`/analyses/finish-time-context`** (WP3)

**H1** (units-neutral):
- "*{a}%* of finishes were under {goal}. Under 3:30: {b}%. Under 3:00: {c}%."
- Data: `PG/<All>.cohorts['all|all|all'].cdf`: `cdf[T − cdf_min] / n`.
- The goal comes from `?goal=` (default 4:00). The other two marks are the next two lower round half-hours.

**Dek:** "How does my target compare with the field?"

**★ Answer (night):** a Cdf cropped to p1–p99, with an orange ring at the goal and detents at round marks. Readout: "Under 4:00: 42% of finishes".

| # | Id | Track | H2 | Data | Form |
|---|---|---|---|---|---|
| 1 | `#field` | chapter-1 | "The field changes the meaning: under {goal} is *{w}%* of women's finishes, {m}% of men's." | `cohorts['all\|Women\|all']`, `['all\|Men\|all']` | Segmented All / Women / Men. **One cohort at a time** |
| 2 | `#explore` | chapter-2 | "Make it yours." | `AnalysisExplorer` (S2 `analysis-url` case: `race`, `goal`, `age`, `gender`) | sheet or inline |

**Removed:** the x axis running 1:30–12:00. The `FinishTimesLink` aside becomes an "also" row to `/finish-times`.

### 7.9 Chapter 07 · Who holds pace

**`/stories/who-holds-pace`** (WP2)

**★ Reading (pair):**
- "20% · 45%", with a dumbbell Ruler.
- Sentence: "At the same finish times, *20%* of recorded women's and *45%* of men's finishes had a sustained slowdown."
- Data: `I/demographics.json → overall.women_slowdown`, `.men_slowdown`. G: men > women.

| # | Id | Track | H2 | Data | Form |
|---|---|---|---|---|---|
| 1 | `#unmask` | chapter-1 (**Scrolly**) | Steps: pooled ("Pooled, women's second 20K slowed {pw}, men's {pm}") → matched ("Compared within the same race and finish minute: {w} and {m}") → "*{r}×* as big a gap" | `overall.pooled_women_block`, `pooled_men_block`, `women_block`, `men_block` | Scrolly of two bars pulling apart. The same component is used in age-and-pacing as a Segmented "Pooled \| Same finish time" |
| 2 | `#ghost` | chapter-2 | "At the same finish time, men reach 25K almost *{x} minutes* ahead of women and give it all back." | `ghost_s` (its max and the km where it occurs) | GhostRace scrubbed by the clock |
| 3 | `#bands` | chapter-3 | "The gap holds from *{lo}* to *{hi}*, widest at {band} ({r}×)." Literals are replaced by the first and last bands where men > women | `bands` | Dumbbell per finish band |
| 4 | `#age` | chapter-4 | "Matched, older runners slowed less: 18–29 *{a}%*, 60–69 {b}%." Plus "every women's age group was more even than every men's" only when `max(W) < min(M)` | `age_contrast`, `ladder` | Age ladder: two columns of rungs with the field line between them |
| 5 | `#field` | chapter-5 | "Women's share of finishes rose in *{k} of {n}* cities." **Not** "most" unless k/n > 0.5 | `women_share_by_city` first against last year (editions cleared by `source_quality`, so Chicago 2015 is excluded) | Slope chart of every city, biggest movers labelled |

**Removed:** the 15 sparkline cards and the second matched-gap definition (`ext_gender_pacing`). Only this page's matched gap is shown.

**`/analyses/age-and-pacing`** (WP3)

**H1:**
- "Pooled, older runners slowed more. *At the same finish time, they slowed less.*"
- Data: argmin and argmax of `PG/<All>.cohorts['<age>|all|all'].retention`, against `I/demographics.json → age_contrast`.
- G: the pooled max age > min age && matched older < younger. F: "How the second 20K changed with age, pooled and matched."

**Dek:** "How does pacing differ across age groups?"

**★ Answer:** a Segmented "Pooled \| Same finish time" (the same component) over age dots.

| # | Id | Track | H2 | Data | Form |
|---|---|---|---|---|---|
| 1 | `#women-men` | chapter-1 | "In every age group, recorded women's second 20K slowed less than men's." G: all ages | `<age>\|Women\|all` against `<age>\|Men\|all` `.retention` | Dumbbell per age |
| 2 | `#explore` | chapter-2 | "Make it yours." | `AnalysisExplorer` (age control off) | sheet or inline |

The `verify-ten-analyses` age regex is re-pinned to "Across N age groups, the second 20K ranged from …".

### 7.10 Chapter 08 · Where you run

**`/stories/courses`** (WP2; "Every course has a fingerprint")

**★ Reading:**
- Figure "55%".
- Sentence: "From its pacing shape alone, an edition's course was named correctly *{x}%* of the time. Chance: 1 in {k}."
- Data: `identification.correct / editions_tested`, `identification.chance`.

| # | Id | Track | H2 | Data | Form |
|---|---|---|---|---|---|
| 1 | `#fingerprint` | chapter-1 | "Where the typical race bends: the slowest 5K is 35–40K on *{k} of {n}* courses." | `typical_curve`, `courses[].slowest_section` | Fingerprint small multiples (3-up scroll-snap) over the typical curve. Tap a course chip to bring its curve forward |
| 2 | `#name` | chapter-2 | "Name that course." | `identification`, `per_course` | **The game:** one edition's curve and 3 course chips, then the reveal plus the model's pick. Score "You {a}/{b} · Model {c}/{d}" (component state only). This is the page's guess, so there is no GuessFirst |
| 3 | `#matched` | chapter-3 | "Same early pace, different endings: *{lo}%* to *{hi}%* sustained slowdown." | `matched.find(b => b.lo_s === <the band nearest 300 present>).courses.filter(n ≥ 1000 && editions ≥ 3)` | A swipe deck of pace bands; each card is a DotStrip of courses |
| 4 | `#hills` | chapter-4 | "Each 1% of uphill grade went with about *{s} points* slower relative pace." | `grade_association.slope`, `.course_sections` | Scatter with a grade cursor |
| 5 | `#steadiness` | chapter-5 | "Half of {a}'s finishes were Metronomes; in {b}, 1 in {k}." (`courses[]` max and min of the Metronome share, finishes ≥ 10,000) | archetypes `courses[]` | DotStrip; a type chip re-sorts it |

**Moved:** `#weather` and `#heat` go to `/stories/race-morning`, and `#years` to `/finish-times#front`. Their anchors become one-line link stubs.

**`/analyses/course-comparison`** (WP3)

**H1:**
- "Sustained slowdown ranged from *{min}%* to *{max}%* of finishes across courses."
- Data: `AF → rows.find(All courses/all/all/early_pace 'all').courses` (n ≥ 100, editions ≥ 3).
- The explorer's `<h2>` keeps "Sustained slowdown rates ranged from…" (pinned by verify-all-finisher-context-client).

**Dek:** "How does pacing compare across courses?"

**★ Answer:** a ranked DotStrip with edition-range whiskers (`slowdown_spread_pct`). Extremes are labelled on the dots. Courses with fewer than 5 editions are hollow. Tap → `/courses/[city]`.

| # | Id | Track | H2 | Data | Form |
|---|---|---|---|---|---|
| 1 | `#early-pace` | chapter-1 | "Whatever the 5–20K pace, the same few courses sit at each end." G: the same course is in the bottom 3 in ≥ 3 of 4 bands | rows by `early_pace` | Pace Chips re-sort with FLIP |
| 2 | `#after-20` | chapter-2 | "The median finish lost *{a}* after 20K on one course, *{b}* on another." | `after20_delta_s` min and max | DotStrip |
| 3 | `#explore` | chapter-3 | "Make it yours." | `AllFinisherAnalysis kind="courses"` + history mode | sheet or inline |

- **Removed:** the two alphabetical 24-row bar lists and the twin lines that sit on top of each other.
- **One source per screen:** all-finisher rates here, `courses.json` on course pages.

**`/analyses/hills-and-pacing`** (WP3)

**H1:**
- "{course}'s biggest climb is *its slowest 5K*."
- The default course is picked by data: the course with the largest Σ`terrain[i].gain` where `argmax(gain) === slowest_section` (`courses.json`).
- F: "Where {course} climbs, and where it slows."

**Dek:** "Where do hills and pace changes line up?"

**★ Answer:** ElevationPace (shared scale) for the default course. The climb section is washed. Scrub along the course.

| # | Id | Track | H2 | Data | Form |
|---|---|---|---|---|---|
| 1 | `#start` | chapter-1 | "{course}'s first 5K drops *{x}*." G: shown only when `terrain[0].net` ≤ −25 m | `terrain[0].net` | Profile with the first section highlighted, linking to downhill-start |
| 2 | `#explore` | chapter-2 | "Make it yours." | `AnalysisExplorer` with the course select (default set, **never "Choose a course"**) | sheet or inline |

**`/courses`** (WP5; the atlas)

**H1:** "Courses". Dek: "{n} city marathons, one distance."

**★ Reading (range):**
- "19–46%", with the sentence "Same marathon distance: *{min}* to *{max}* of finishes had a sustained slowdown."
- One DotStrip of every course (from `courses.json` `slowdown`, the same source as the course pages).
- Dot size = finishes. Tap → the course.

**The list:**
- Sort Chips: "Sustained slowdown" · "Climb" · "Finishes" · "Start temperature" · "A–Z". These are data sorts with no rank words. The default is "Sustained slowdown, low to high".
- Compact rows of 72 px: a 56 px route thumbnail (or a fingerprint when there is no route, never an empty box), the race name, the fingerprint sparkline, the slowdown share and the climb. One column on phones, 2 from 600 px, 3 from 1180 px.

JSON-LD `ItemList` is kept. **Target:** 1.2 screens per 10 courses.

**`/courses/[city]`** (WP5; template §4.3; references R17–R21)

| Section | Content (guards) |
|---|---|
| hero | **★ Reading:** figure `pct(summary.slowdown)`, "of finishes had a sustained slowdown"; sentence "Edition by edition, from *{lo}* in {y1} to *{hi}* in {y2}." (`summary.slowdown_range`, `_years`; G: neither end is a `source_quality`-held or partly loaded edition, otherwise the next eligible). YearStrip scrub with readout: year · share · median · start temperature. Route face. Climb (`data-k="geo.gain"`). `p.hero-dek` = `courseDescription()`. Buttons: "Plan your {city}" (accent) and "Watch the race ↓" (only when there is a replay). `nav.course-toc` |
| `#at-a-glance` (`div.course-glance`) | H2 "What makes {city} *{city}*". Three nugget rows, each with a figure-m, one sentence and a ≤ 48 px micro-viz: **(1) the start:** "The first 5K {drops/climbs} {x}." (`terrain[0].net`, \|net\| ≥ 10 m, else "The first 5K is flat"). **(2) the late miles:** "The slowest 5K is {section}." Plus "On {k} of {n} courses it's 35–40K" when this course differs (G: `slowest_section ≠ '35–40'`), else "like {k} of {n} courses". **(3) the fingerprint:** "Named from its pacing shape in *{c} of {e}* editions." (`identified`) |
| `#finish-times` | H2 "The median finish moved from *{a}* in {y1} to {b} in {y2}." Median-by-year scrub line on a time-scaled x with "No race" gaps. CourseTable in Values |
| `#elevation` | H2 "The biggest climb is *{section}*: {gain}." ElevationPace on the shared scale. `dl.course-totals` holds one total climb and one total descent; the section readout shows only that 5K's climb (this fixes the two climb figures appearing side by side) |
| `#pacing` | H2 "More *{type}s* than the typical course." G: ≥ 2 points, else "Paced much like the typical course". Six type rows (glyph, colour, course share against all courses as a dumbbell). Fingerprint against typical, with the signature section glowing |
| `#slowdown` | H2 "{race} among every course." DotStrip of every course, this one in signal; < 3 races hollow |
| `#goals` | H2 "On {goal} pace through 20K, *{x}%* of {city} finishes made {goal}." (`I/tools/course-goal.json` rows; n ≥ 100). Goal Segmented 3:00–5:00 (default 4:00, or `?goal=`). DotGrid. Cells: made the goal · sustained slowdown · given back after 20K · typical finish. "Every goal" CourseTable with `#goals tbody th a` aria-label "Plan a {goal} {race}". Same-pace dots against other courses (`courses.json → matched`) |
| `#weather` | H2 "At *{t1}* in {y1}, {s1}% had a sustained slowdown. At {t2} in {y2}, {s2}%." Two facts, never "warmer, therefore". `p.course-hotcool` only when ≥ 5 °C apart (shown as °F in miles mode). Scatter of editions. `p.course-slope` when it exists |
| `#plan` | H2 "Plan *your* {city}." Plan your race · Pace band · Check your splits; qualifying when present |
| `#replay` | H2 "Watch {race year} unfold." RaceReplay field and route |
| `#other-courses` | H2 "Shaped like *{city}*." 3–5 nearest fingerprints (Euclidean on `deviation`, ≥ 5 editions), each a row with a sparkline and a link |

**Removed:**
- the duplicate pooled pace profile (`ResearchQuestion`);
- "the study / how we measured it";
- "about this data";
- the hero and plan CTAs repeating each other: the hero keeps one primary;
- the alphabetical neighbours;
- 20-row tables open by default.

### 7.11 Chapter 09 · The weather

**`/stories/race-morning`** (WP2, **new**; slug `race-morning`; title "Race-morning weather"; kicker "The weather"; data `I/courses.json → weather`)

Adding this story needs:
- a `STORIES` entry in `lib/stories.ts` (with file `courses.json`);
- a `BODIES` entry (`RaceMorningBody`);
- `STORY_SLUGS` in `lib/analytics-policy.ts`;
- `/methodology#story-race-morning` (WP7);
- an OG card (WP9).

**★ Reading:**
- Figure "197 of 225".
- Sentence: "In *{a} of {b}* pairs of editions of the same course started at least {gap} apart, the warmer one had more sustained slowdowns."
- Data: `weather.pairs.hotter_slowed_more`, `.total`, `.min_gap_c`, with the gap shown as °F in miles mode. G: a > b/2.
- Instrument: a mini waffle.

| # | Id | Track | H2 | Data | Form |
|---|---|---|---|---|---|
| 1 | `#pairs` | chapter-1 | "Compare a course *with itself*." | `weather.pairs` (the list) | Waffle of the pairs. Tap a tile → its two editions |
| 2 | `#curvature` | chapter-2 (**Scrolly**) | Steps: near {cool}: "+{a} min per degree" → near {warm}: "+{b} min per degree" → "each degree counts for more when it's already warm" | `weather.curvature.finish_min_per_c` at 5 and 20 °C (converted to per °F in miles mode) | Scrolly over a temperature curve with the slope tangent drawn at each step. Ends as a scrubbable thermometer |
| 3 | `#heat` | chapter-3 | "Warm mornings change the shape, not just the clock." Copy note: relative to each finish's own average. Never "people start faster when it's hot" | `weather.heat_signature[i].per_10c` | LineProfile of the typical curve tilting with a temperature Segmented (cool / typical / warm) |
| 4 | `#untangle` | chapter-4 | "Across courses, start temperature lines up with about *a tenth* of the spread. Within each course, about *a third*." | `weather.fits.slowdown_across.r2`, `slowdown_within.r2` (as words; never "R²") | Scatter that untangles into per-course lines (Segmented "All courses \| Within each course") |

**`/analyses/race-day-weather`** (WP3; three tabs)

**H1** (temperature tab):
- "The coolest start wasn't the steadiest: *{band}* had the fewest sustained slowdowns."
- Data: argmin `slowdown_pct` over `AF → rows[All/all/all/all].weather[]` with `edition_n ≥ 5`.
- G: the argmin is not the coldest band. F: "Sustained slowdown by start temperature."

**Dek:** "How do warm and cool races compare?"

**Tabs:** a Segmented of "Start temperature" · "Warming" · "Wind". The hash `#temperature`, `#warming` or `#wind` selects the tab, so the legacy redirects land on the right one. A tab shows only when its `WX` candidate is ready.

| Tab | ★ | Form |
|---|---|---|
| Start temperature | Five band columns (°F in miles mode). Bands with fewer than 5 editions are hollow and keyed "few races". The reader's forecast chip snaps to a band and links to weather-match | Columns plus Chips |
| Warming | "When the temperature rose {q75} instead of {q25} over the first four hours, the second 20K slowed about *{est} points* more." (`WX → candidates.find(id === 'warming')`: `effect.estimate`, `low`, `high`; `exposure.q25`, `q75`. G: `status === 'ready'` && `low > 0`) | EffectBand: five binned means plus the estimate band. The 192-edition scatter goes into Values |
| Wind | "A typical breeze made *no material difference*: under 1 point." (`takeaway_type === 'precise_null'`; G: \|low\|, \|high\| < 1) | EffectBand in grey with a ±1 "no material difference" band. The figure uses the `null` Reading variant |

| # | Id | Track | Content |
|---|---|---|---|
| 1 | `#same-course` | chapter-1 | "Course mix shapes these bands. Compare a course with itself." Links to the story's pairs |
| 2 | `#explore` | chapter-2 | "Make it yours." `AllFinisherAnalysis kind="weather"` (sheet or inline) |

- **Removed:** the Recharts scatter, the faded caveat card that overlapped the answer, and the red +0.32 alarm figure for a null result.
- **Contract:** `WeatherAnalysis` still renders, with `.analysis-layout`. `verify-weather` renders this page.

**`/tools/weather-match`:** §7.13.

### 7.12 Chapter 10 · Your race

**`/runners`** (WP6; noindex; never recorded; reached only from the nav, so it has no reading)
- H1 "Analyze a past race" (the only H1, pinned).
- Dek: "Find a recorded race by name, or start from your splits or a finish time."
- **Search** (`.runner-search-form.ph-no-capture`): one instrument cell `#runner-name` (no `name` attribute), a submit button (`.runner-search-form button[type=submit]`, secondary ink) and a "Recorded times only" note.
- **Starts:** `a.runner-start[href="/tools/split-check"]` with "<b>Have your splits? Paste them</b>", and `form.runner-start.runner-start-time` (no input `name`), shown as two 64 px rows.
- **Results:** `.runner-matches li` with `.runner-match` rows of 56 px. The profile `#runner-profile .runner-race`, `.runner-eligible`/`-ineligible`, and checkboxes drawn at 24 px with a 44 px hit area. `.runner-selection` is a sticky bottom bar on phones with `.runner-selection-actions .button-primary`.
- **Context** (`.runner-context.ph-no-capture`): the existing pacing, similar-runner and conditions views. Charts become `LineProfile` and `ShareBar` (no Recharts). Every pinned selector is kept (`.rc-multi`, `.runner-numbers`, `.rc-report …`). Links out carry `runnerHandoffHref` (`via=runner`). `<div data-track-section="report"><Suspense` is kept.
- **The no-match next step** (`.runner-nomatch-next a`) keeps its link order (`verify-runner-search`): `/analyses/finish-time-context`, `/tools/split-check`, `/request-analysis`.
- Ends with a ChapterEnd: next is `/tools/split-check`.

**`/tools/split-check`:** §7.13.

**`/report`** (WP6; noindex; never recorded; "the lap screen")
- `ReportView` keeps `<div className="report-tracked" data-track-section="report" hidden={!times}>`.
- **`RaceReport`** (`.race-report.ph-no-capture`):
  - **Reading:** `h3.race-report-title` (the race and the year). The finish time as figure-l. The sentence in the report's own voice: "This race: ahead of {p} in every 100 other finishes in {race year}." Peers need ≥ 101 finishes and the percentile excludes the record. Never you, your, percentile, rank or record.
  - **Lap list:** nine mats as a stopwatch list. Each row: the mat, the split, the section pace and a bar against early pace. The first sustained-slowdown section is marked in signal. The finish row has a checkered rule. `.race-report-table` holds the same data for S3.
  - **Tiles:** `<span>Sustained slowdown</span><strong>Yes|No</strong>…` (pinned markup), the pacing type (TypeGlyph plus its share) and the opening band with the bank receipt (chapter 02 link).
  - **Badges:** `race-report-badge is-data|is-research` linking to `/methodology#evidence`.
  - `.race-report-note` and `.race-report-foot` ("not an official placing").
- **`ReportActions`** (`.tool-share.share-bar`): Save image, Share, Copy link, Print. The PNG is restyled like the share card (night, the Bricolage time, the lap list) and stays 1080×1350, `pace-notes-race-report.png`, built lazily by `lib/report-image.ts`.
- **Without times:** an instrument panel to paste splits (the existing behaviour).

### 7.13 Chapter 11 · The next one, and the chapter tools

**`/analyses/finding-improvement`** (WP3)

**H1:**
- "Improving runners found *{share}* of their time in the last {dist} of the race."
- Data: `PG/<All>.cohorts['all|all|all'].gains['240'].values[2] / total`; the distance is "12.2K", shown as 30K–finish.
- G: share > 12.195/42.195.

**Dek:** "Where do improving runners find time?"

**★ Answer (night):** a course bar split 0–10K · 10–30K · 30K–finish, with the minutes stacked as coins (one coin per minute). Per-km readout: "{a}s → {b}s → {c}s per km". It is units-aware: per mile in miles mode.

| # | Id | Track | H2 | Data | Form |
|---|---|---|---|---|---|
| 1 | `#every-goal` | chapter-1 | "From *{lo}* to *{hi}*, the final stretch gave the most time per km." G: count the buckets where it holds, and say "every" only if all do | `gains` keys and values | Goal Chips |
| 2 | `#next-race` | chapter-2 (moved from `final-kick#follows`) | "After a sustained slowdown, the next race had one *{o}%* of the time. Typical for that race and pace: {e}%." G: o > e | `I/kick.json → recurrence.after_slowdown.observed`, `.expected`; `after_none.observed` | Two doors ("Last race: a sustained slowdown" / "none"), each with a DotGrid |
| 3 | `#spacing` | chapter-3 | "The gap between races barely mattered: the median next-finish change stayed between *{a}* and *{b}*." | `P/ext_race_spacing_outcomes/tables/spacing.csv` | A flat line with wide p10–p90 whiskers. The width is the story |
| 4 | `#explore` | chapter-4 | "Make it yours." | `AnalysisExplorer` | sheet or inline |

Next card: `/tools/plan`, "Plan the next one".

**`/tools/plan`** (WP4; chapter 11, page 2; the finish of the journey)
- **Header:** H1 "Marathon race planner" (registry), with the ● Pace Notes data badge.
- **Inputs:** `#plan-course` and `.plan-goal input` (keypad; "3.5h" and "3.75 hours" read as times on desktop).
- **Goal bar** on phones.
- **Results:**
  - The `sr-only aria-live` summary.
  - `#plan-headline-title` "{goal} in {course}" as figure-l with the pace "9:09/mi" (Per mile … Per km …).
  - The mats as a lap list (`.plan-mats-k`).
  - The three tracked divs exactly as today.
- **`comparison`:** the data nugget.
  - "On {goal} pace through 20K across {n} courses, *{u}%* made {goal}; {s}% had a sustained slowdown."
  - Data: Σ(n·under)/Σn over `I/tools/course-goal.json rows.filter(goal === G)`, labelled "across N courses". For a single course, that course's row.
  - A DotGrid updates live.
- **`pace-band`:** a strip preview and the ShareBar ("Copy link", "Print wristband strips", "Print this plan", with `data-not-edit`).
- **Handoffs:** the `MarathonHandoffs` copy is pinned.
- **Removed:** the long definition with its DOI, the three stacked buttons and the duplicate link lists.
- **The finish card:** §2.6.

**`/tools/pace-band`** (WP4)
- "Goal finish time" with its inline keypad hint, and the existing goal bar.
- Course, and the gender `Choice` (`ph-no-capture`, `[aria-labelledby="pace-band-gender"] button`).
- **Result:** the band preview.
- **Directly under it:** the held-against-slowdown LineProfile ("Finishes that later had a sustained slowdown passed 20K {x} earlier"). Data: `groups.held`, `groups.slowdown`.
- The 26-row band list goes into Values. Printing is unchanged.

**`/tools/course-chooser`** (WP4)
- `#course-chooser-goal`. **`#course-chooser-sort` defaults to "Share under goal".** Order, month and `#course-chooser-open` are kept.
- **Lead:** a ranked DotStrip of every course by the share under the goal, with min and max shown.
- **The list** (`.course-chooser-list[data-tool-controls].ph-no-capture`): one 64 px row per course with the name, a share-under-goal bar, the sustained slowdown and "Plan {goalText}". This replaces the 22 cards × 3 tiles × 3 pills.

**`/tools/predictor`** (WP4)
- Inputs `-t1`, the distance, and `details.predictor-more` (`-t2`, weekly `-wk`, /Average training pace/).
- **Result (night):** the range "4:05–4:15". The ◆ Published research panel sits apart from a separate ● Pace Notes data panel: "Finishes on pace for {T} at 20K finished in a median {X}". They are **never combined**.
- Handoffs: "Turn this into a pace band" and "See how finishers near this time paced".
- The research essay is reduced to one collapsed details block in the research panel. It carries no named method citations (BANNED).

**`/tools/projector`** (WP4; chapter 04, page 3)
- One-line mat Chips ("30K"), `#projector-time`, `#projector-prev`, /Target finish/, `#projector-start`.
- **Result:** the range plus percentile cells.
- "Full result ↓" (`data-not-edit`).
- Saved cards: `.projector-cards.ph-no-capture`, `#projector-card-label`, "Save runner card".
- **No accuracy nugget on the page** (`verify-tools` BANNED `AccuracyPanel`). The validation stays at `/methodology#tools-projector`.

**`/tools/split-check`** (WP4; chapter 10, page 2)
- The nine mat boxes `input[id$="-t0..8"]` with one shared keypad hint, `details.split-check-paste` with `textarea[id$="-paste"]`, the course, and gender (`ph-no-capture`).
- **Result (night):** the verdict reading ("27% slower after 30K: a sustained slowdown from 30K"), then section bars with the hatched slowdown zone, the reader's bars over the window's median bars and a "you" ring at the onset.
- **Nugget:** "Of finishes at your time on this course, {sd}% had a sustained slowdown." Data: `I/tools/pace-band.json` shards, `groups.all.sd[g]`, with n ≥ 100.
- "Make a race report" goes to `/report`.
- **Fix:** the negative `<rect>` width console error (clamp at 0).

**`/tools/weather-match`** (WP4; chapter 09, page 3)
- `#weather-match-temp` is a draggable thermometer (a scrubber over °F or °C) with a numeric field. `#weather-match-hum` is the dew point. "Marathon goal time" and the course.
- **Result:** the side-by-side night columns, "Mornings like yours" against the 8–12 °C reference (as °F in miles mode). They are never subtracted.
- **Lead nugget:** "At a {pace} early pace, sustained slowdowns were least common near *{t}* ({s}%)."
  - Data: `I/tools/weather-match.json` rows with `hw === 3` and the reader's pace: argmin and argmax of `sd`.
  - G: n ≥ 1000 and ≥ 5 editions.
- The beeswarm comes second. The 9-row table goes into Values. The ◆ Published research panel is collapsed.

### 7.14 Reference tools (WP4)

| Page | Spec |
|---|---|
| `/tools` | H1 "Runner tools". Groups (Plan · Race day · Afterwards · Qualify) as rows of 72 px: `ToolIcon` in ink, the title, the short line and `EvidenceTag compact`. A data tool shows only when its file is in the verified manifest. Pace-chart links follow. **No per-tool hues.** The four principle notes become one line of copy |
| `/tools/pace-calculator` | Time / Pace / Distance cells (`getByLabel('Time')` with keypad, `/^Pace per mile/` with no hint). The view tabs `.tool-tabs.no-print[data-tool-controls]` and `section.tool-panel.panel-plain.pace-chart[data-tool-controls]` keep their markup. The result reading: Time · Pace · Treadmill. **Splits default to the 5K mats**, with a "Every mile" or "Every km" toggle to expand. The watch-overrun table goes into Values. No badge |
| `/tools/qualifying` | "Chip (net) time", "Race date", "Date of birth" and "Remember my date of birth on this device" (the existing key), `details.qualifying-more` with /Course net drop/, and the Division `ph-no-capture`. **Result:** "Meets {k} of {n}" as figure-l, then one row per race with a ± bar (the six detail cards collapse to rows that expand). Badge ■ Official standard. The verified-date line stays |
| `/tools/qualifying/[race]` ×6 | H1 race standards. The standards table in a region. **Boston:** a YearStrip lollipop timeline of the cut-offs ("0:00 in 2022–23 to 7:47 in 2021") with a "No cut-off" style for zero. Rules prose at a 36 rem measure |
| `/tools/marathon-pace-chart`, `/tools/half-marathon-pace-chart` | Utility tables with a sticky first column and an edge fade with "Scroll →". Each "Pace band" link becomes a 44 px icon button with an accessible name. Print is unchanged |
| `/tools/marathon-pace/[goal]` ×5 | The summary (night): pace, splits and "Plan this goal". **Second card:** "The pile-up before {goal}": {ratio}× as many finishes in the minute before {goal} as a smooth curve expects (`marks.find(m => m.minutes === G).ratio`), as a mini Histogram linking to `/stories/round-numbers`. **Third:** "Sub-{goal} finishers didn't run even either" (`pace-band` `groups.all.s50`, `e50`; G). Tables go into Values. The sentences from `lib/tools/goal-facts.ts` keep the causal-verb ban |

### 7.15 Info pages (WP7)

| Page | Spec |
|---|---|
| `/methodology` | H1 "How we know". Dek: one line. **A "Jump to" Chips bar** sticks under the header on phones: Data · Definitions · Calculations · Limits · Archive. From 1180 px a **left rail** lists the parts and topics with scroll-spy. Parts keep `#data #definitions #calculations #limits` and every topic anchor in `inventory.md` §1.2 and §3.5. New anchors: `#story-race-morning`, `#archive` (the packs index link plus a one-line description). Each definition is a **spec card**: the term (H3), the rule in one line, then a small instrument. The sustained slowdown card reuses `/slowdown`'s threshold Scrubber. The 76 `<details>` stay closed on load; the HTML weight is unchanged (an optional later split). **The units switch works:** WP7 adds `/methodology` to `UNIT_PAGES` and moves distances to `UnitText`. JSON-LD `Dataset`. Target: 14 screens with details closed |
| `/about` | H1 "About Pace Notes". Three short sections: Who (Andrew Kam), Why, and "Ask a question" (Request an analysis, Open data). Every data-source and coverage sentence moves to `/methodology#data`. No `private-export` or "September 11" (`verify-weather` renders it). 2.5 screens or fewer |
| `/privacy` | The prose template. The `COUNTED` list as a definition list. `AnalyticsPreference` as a switch row with the button "Turn off analytics" and the status "Analytics is off for this browser." |
| `/request-analysis` | Prose and form: `#analysis-question` and `#analysis-details` in instrument cells, then the mailto, Gmail and copy fallback buttons |
| `/404` (`app/not-found.tsx`) | "This page isn't on the route", the `Runner` art standing still, and links to Home and Contents |
| `app/error.tsx`, `app/global-error.tsx` | "This page didn't load properly", with Reload and Home. The heading takes focus. `global-error` keeps inline styles that use the token values written out |

### 7.16 Archive and legacy (WP8)

| Page | Spec |
|---|---|
| `/packs` | H1 "Research archive". Dek: "Earlier research questions, kept for reference." The questions by theme as 52 px rows, plus supporting analyses. Linked from `/methodology#archive` and the contents reference block |
| `/packs/[packId]`, primary | Restyled through the shared primitives: `ResearchQuestion`, `StudyFigure` and `QuestionViz` (WP3 restyles them). Headings h1 → h2 → h3 (this fixes today's jump). No new layout work |
| `/packs/[packId]`, alias | Stub plus 308 (§2.9) |
| `/research/personalized` | Stub plus 308. `PersonalizedGuide` is deleted |
| `/your-race`, `/htw`, `/packs/smyth_htw` | The existing stubs in the prose template |
| `/analyses/warming-and-pacing`, `/analyses/wind-and-pacing` | Stubs rendered by `app/analyses/[slug]/page.tsx` (WP3) with the target hash. WP8 adds the 308s and the sitemap removal |

---

## 8. Work packages

### 8.0 Rules every package follows

**Ownership.**
- A package edits only the files it owns. The exceptions are named in its "May also edit" line.
- Three files are shared by entry: `scripts/verify-analytics.cjs` (per-file entries), `scripts/e2e/scenarios/s2-differential.cjs` (per-route cases) and `scripts/e2e/known-differences.json`. Each package edits only its own entries, and WP9 resolves conflicts.
- A change a package needs in a file it does not own is pre-specified in this document. The owner implements it.

**Branching.**
- Each package branches from the WP0 merge commit, with `feat/release-1652` merged in whenever it lands.
- Packages merge into an integration branch, `feat/redesign`, in the order WP0 → (WP1…WP8 in any order) → WP9.
- Commit and PR footers follow `AGENTS.md`, the repository instructions.

**The screenshot protocol** (`scripts/design/shoot.cjs`, built by WP0-A). It serves `out/` through `scripts/e2e/server.cjs`, using Playwright from `node_modules/playwright`. Keep runs lean: one browser and serial pages, because the machine has 4 shared CPUs.

```
node scripts/design/shoot.cjs --routes=<comma list | @file> --out=<dir> [--profiles=all|phone,desktop,…] [--ix]
```

| Profile | Viewport | Captures |
|---|---|---|
| `phone` | 390×844, DPR 2, mobile, touch | first screen + full page |
| `phone664` / `phone714` | 390×664 / 402×714 | first screen (home only) |
| `desktop` | 1440×900 | first screen + full page |
| `dark` | phone, with an init script setting `data-theme="dark"` | first + full |
| `reduced` | phone, `reducedMotion: 'reduce'` | full |
| `km` | phone, `?units=km` | first |
| `zoom` | 195×332 | first (home, plus every page with a sticky element) |

- Before capturing, it waits for `document.fonts.ready`, waits 800 ms, scrolls through the page once (so reveals fire) and returns to the top.
- `--ix` runs the interaction scripts from `scripts/design/interactions.cjs`: menu open, sheet open, a scrub to 30% and to a detent, guess dragging and revealed, segment changed, deck swiped, replay at its flag and playing, Values open.
- `scripts/design/sheet.py` writes contact sheets per route.

**The layout linter** (`scripts/design/lint-layout.cjs --routes=… --widths=195,320,390,1440`). It fails on:
1. horizontal page overflow;
2. any visible `a`, `button`, `input`, `select`, `summary` or `[role=slider]` smaller than 44×44, except inline links inside running text;
3. SVG or chart text rendering below 12 px;
4. text-on-text overlap above 2 px² inside a `figure.viz`;
5. text outside its SVG;
6. console errors and page errors;
7. on `/` only, more than one `rgb(255, 91, 46)` control on the first screen;
8. HTML text inside a `figure.viz` cut off at the figure's edge or at an element that clips its overflow, by more than 1 px (a scroller's content and an ellipsis are exempt). Added October 18, 2026 (round 1, part B), after a pace block's "+3" ran past the frame on phones.

**The "looks off" checklist.** A page is not done while any of these is visible in its captures:
1. A label collides with another label, or a label crosses a mark.
2. Text is clipped, or a chip or tab row is cut off with no scroll cue.
3. More than one orange thing appears in a chart, or orange appears that is not the reading, "you" or the primary button.
4. A box sits inside a box.
5. The default load shows an empty state, or a form comes before the answer.
6. Two numbers on one screen disagree (denominators, or 3.5 million against 3.4 million).
7. Miles are shown to two decimals, or "10K" is used as a count.
8. Mono caps are used for row labels, legends or readout keys.
9. A fixed or sticky element covers content or a control.
10. More than about 40% of a phone screen is empty between beats, or a desktop frame is mostly empty.
11. Ticks are under 12 px, grey text is under 4.5:1 or marks are under 3:1.
12. A heading ends on one orphan word.
13. Keyboard pass: the focus ring is missing.
14. Dark mode: a mark is unreadable, or a surface dissolves into the page.
15. Reduced motion: something still moves.
16. A headline contradicts its chart: the default control state differs from what the headline names.

**Checks each package runs before review.**
- `npm run verify:data`, `npm run verify:analytics`, `npm run verify:compat`, `npm run build`, `npm run verify:compat -- --build` and `npm run verify:seo`.
- `node scripts/verify-nuggets.cjs` and `node scripts/verify-css.cjs`.
- `NEXT_PUBLIC_POSTHOG_KEY=phc_test_dummy NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com npm run build && node scripts/verify-replay-e2e.cjs --only=<the scenarios touching its routes>`. S8 runs without write.
- The `shoot.cjs` and `lint-layout.cjs` runs on its routes.
- Python tests only if analysis code changes (none of these packages should change it).

**Done means:**
- every owned route's captures (every profile, plus `--ix` where listed) have been reviewed against the checklist;
- the lint is clean;
- the checks are green;
- every owned page's initial JS is at most its WP0 budget figure + 1,536 B;
- the phone-length target is met;
- the PR attaches the contact sheets.

**Dependency graph:**

```
WP0-A (tokens, fonts, CSS split, primitives, tooling)
  ├──► WP0-B (shell, nav, chapters, closing stack)   ─┐
  └──► WP0-C (charts, replay, units, nugget core)     ├──► WP0 merge + one --write-budget
                                                       │
        ┌──────────────┬───────────┬──────────┬───────┴──┬──────────┬──────────┬──────────┐
        WP1 Home   WP2 Stories  WP3 Analyses  WP4 Tools  WP5 Courses  WP6 Runner+  WP7 Hub+   WP8 Legacy
                                                                      report      info
        └──────────────┴───────────┴──────────┴──────────┴──────────┴──────────┴──────────┘
                                              ▼
                                   WP9 Integration and release
```

### WP0-A: tokens, type, CSS split, primitives and tooling (first; blocks everything)

**Routes:** none directly. It adds `/design-system` (noindex, never in the sitemap, owner decision 14), a gallery of every primitive and token with real data. Like any exported page, it gets `pageMetadata()` with `robots: noindex`, one H1 and an S8 budget entry. It is not linked from any page, and `verify-seo orphans` covers sitemap pages only.

**Owns (creates):**
- `app/styles/{fonts,tokens,base,layout}.css`
- `app/styles/components/{button,forms,segmented,chips,sheet,reading,receipt,nugget-card,values,table,tag,badge,guess,scrolly,marker,share}.css`
- `app/styles/legacy/*.css`
- `public/fonts/*.woff2`, `scripts/fonts/copy-fonts.cjs`
- `components/ui/{Reading,Receipt,NuggetCard,BigNumber,MarkerBadge,Segmented.client,Chips.client,GuessFirst.client,Scrolly.client,Reveal.client,Sheet.client,MakeItYours.client,Values,Button,Arrow,Tag,ShareButton.client}.tsx`
- `lib/share-image.ts`
- `scripts/design/{shoot.cjs,interactions.cjs,lint-layout.cjs,sheet.py}`, `scripts/verify-css.cjs`
- `app/design-system/page.tsx`

**Owns (modifies):**
- `app/layout.tsx`: CSS import order, font preloads, `viewport.themeColor`, and mounting `SiteFooter` once WP0-B delivers it.
- `app/globals.css` and `app/story.css`: emptied into `legacy/` by a **mechanical split by owner**, with no rule changes.
- `scripts/font-fallbacks.cjs`.
- `components/KeypadHint.tsx` (style only).
- `components/tools/EvidenceTag.tsx` (glyph and word; same classes and hrefs).
- `package.json`: adds `design:shoot`, `design:lint` and `verify:css`. It also adds `verify-css`, `verify-chapters` and `verify-nuggets` to `verify:data` up front, as stubs that exit 0 until WP0-B and WP0-C deliver the real scripts. WP0-A is the only package that edits `package.json` until WP9.

**May also edit:**
- its own entry in `verify-analytics` (`GuessFirst` carries `which-card`);
- the `verify-tools` `EvidenceTag` expectations, only if the markup changes. It should not.

**Acceptance:**
1. **The CSS split is visually lossless.** `shoot.cjs` before and after on `/`, `/research`, `/stories/round-numbers`, `/analyses/starting-pace`, `/courses/boston`, `/tools/plan`, `/tools/pace-band`, `/runners`, `/report`, `/methodology`, `/packs` and `/privacy`, at phone and desktop, differ by 0.1% of pixels or less (replay canvas excluded).
2. **Fonts.** The new families load from `public/fonts/` and two are preloaded. `font-fallbacks.cjs --check` passes. CLS is 0 on font swap on `/` and `/tools/plan` (S8 lab). First-visit Latin woff2 totals 280 KB or less. I1 finds no third party.
3. **Primitives.** Every primitive on `/design-system` matches §3.5 in every state: default, hover, focus, pressed, selected, disabled, loading and error. Both the light and `data-theme="dark"` variants are shown. The keyboard pass is complete.
4. **Tooling.** `shoot.cjs` and `lint-layout.cjs` run and produce contact sheets and a JSON report. `verify-css.cjs` passes on `app/styles/**` (legacy files exempt until WP9).
5. **The token contract holds.** The OG `TOKENS` are unchanged and `og:check` passes.

**Captures:** `/design-system` with every profile, plus the 12 split-check routes before and after.

### WP0-B: shell, navigation, chapters and the closing stack

**Owns:**
- `components/{SiteHeader,SiteNav,MenuSheet,ReadingBar.client,ChapterRail,ChapterEnd,NextCard,SiteFooter,ChapterLink,PageFeedback,MotionToggle}.tsx`
- `components/UnitsProvider.tsx`: the `UnitSwitch` presentation only. Its logic and markup contract are unchanged.
- `components/ui/{ChapterList,ChapterHeader}.tsx`
- `lib/chapters.ts`, plus a unit test for it, `scripts/verify-chapters.cjs` (new, added to `verify:data`).
- `app/styles/components/{header,menu,reading-bar,chapter-list,next-card,footer,feedback}.css`
- `scripts/e2e/scenarios/s1-browse.cjs`, every function except `unitSwitch()`.

**Deliverables:**
- the header with its hide-on-scroll and reading bar (§2.4);
- the menu sheet with `#site-menu` exactly as pinned, plus `nav.chapter-list` outside it;
- the desktop inline links and the Chapters drawer;
- the rail;
- `ChapterEnd` with `NextCard` and the finish card;
- the restyled `PageFeedback`;
- the footer;
- `lib/chapters.ts` with every page from §2.2;
- `ChapterLink`, which carries `goal=` on chapter links when the current URL has one, added in the browser after hydration and never in the server HTML (and `units=km` through `UnitLink`).

**Acceptance:**
1. **S1 passes unchanged:**
   - the nav shows five links plus the three `.nav-more` links on phones and only the five on desktop;
   - exactly one `.nav-primary`;
   - the menu at 195 px: every link scrolls into view with its text inside its pill;
   - the header at 195 and 201 px: no overlap or clipping;
   - the footer privacy link.
2. **`verify-chapters`:** every `nextOf` and `prevOf` resolves to a built route; every `howWeKnow` anchor exists in the `/methodology` HTML; every sitemap story and analysis appears exactly once in `CHAPTERS`.
3. **The sheet:** opens, traps focus, closes on Escape and on a scrim tap, returns focus, and cannot be focused when closed (Playwright test inside `interactions.cjs`).
4. **The reading bar:** appears when the header hides on a story, shows plausible minutes left (±1 against a manual count on `/stories/round-numbers`) and its ticks sit at beat starts.
5. **Budget:** the root shell adds 1.4 KB or less of gzip on `/privacy`, `/about` and `/tools` (S8). **After WP0-A, B and C merge, WP0-B runs `--write-budget` once**, with the note "redesign foundation".

**Captures:** `/`, `/privacy`, `/stories/round-numbers` and `/courses/boston` with every profile, plus `--ix` (menu open on phone, menu at 195 px, chapters drawer on desktop, reading bar mid-story, next card hover and focus).

### WP0-C: charts, replay, units and the nugget core

**Owns:**
- `components/viz/**`: the new primitives and forms (§3.6), `RaceReplay.tsx` rewritten to read tokens and draw rank lanes, `ReplayPoster.tsx`, `labels.ts`. `useSize.ts` is kept.
- `components/story/HeroReplay.tsx`
- `components/story/Units.tsx`
- `lib/viz/{format,palette}.ts`: the re-stepped pacing types (§3.1); `PACE_RAMP` is kept.
- `lib/units.ts`: `sectionLabel`, `matLabel`, one-decimal `distance`.
- `lib/nuggets/{types,core,format,index}.ts`
- `scripts/verify-nuggets.cjs`, `scripts/verify-units.cjs`
- `app/styles/components/{chart-frame,scrubber,dot-grid,ruler,replay}.css`

**May also edit:** the S6 error-state regex, only if the new `ChartFrame` error copy needs it. It should not: the copy is "could not load".

**Deliverables:**
- every chart form in §3.6, rendered on the server with real data on `/design-system`, at 390 and 1440 px, with Values twins;
- `Scrubber` with touch, mouse, keyboard and detents;
- the replay: rank lanes, the flag frame, the poster, the lazy chunk, the token colours, and the reduced-motion still;
- `siteTotals()` and every format helper (`inWords` with the fixed denominator list, `approxWords`, `countWord`, times, paces, `tempGap`);
- the `verify-nuggets` harness with three reference nuggets: `site.totals`, `replay.first` and `field.median`.

**Acceptance:**
1. Every form passes `lint-layout` at 390 and 1440: no collisions, ticks of 12 px or more, no text outside its SVG.
2. Scrubber Playwright tests:
   - a horizontal drag moves the needle 1:1;
   - a vertical drag scrolls;
   - a tap sets it;
   - the arrows step and PageUp/PageDown jump between detents;
   - the readout's `aria-live` text updates after the drag settles;
   - the default position equals the headline's detent.
3. The replay:
   - no CLS while it loads (the poster is in place);
   - it starts within 20 race-minutes of the flag and pauses on the flag with the sentence;
   - under reduced motion it is static;
   - the edition is chosen by argmax;
   - `.replay` and `.hero-replay` are kept;
   - it is absent from the page chunks of courses without a replay.
4. `verify-units` is updated for mat labels and passes in both units. S1's units placeholder check passes.
5. The `verify-nuggets` harness recounts the reference nuggets independently and fails when given a fixture whose guard is flipped (the self-test).
6. `RaceReplay` contains no hard-coded colour.

**Captures:** `/design-system` (charts section) with every profile and `--ix` (a scrub mid-drag, at a detent, a lens toggled, the replay playing and at its flag).

### WP1: home (`/`)

**Owns:**
- `app/(home)/page.tsx`
- `components/home/**`: `HomeDoors` (restyled, form contract unchanged), `PlanFormUnits` (unchanged), plus new `StakesGuess.tsx`, `StoryDeck.tsx` and `HomeReplayBand.tsx`
- `lib/nuggets/home.ts`
- `app/styles/pages/home.css`
- `app/styles/legacy/home.css` (deletes rules as they migrate)

**Builds:** §7.1.

**Acceptance:**
1. **S1 first screen at 390×664 and 402×714:** the title, the Plan button and both doors fit, and "Plan your race" is the only `rgb(255, 91, 46)` control. S1 at 200% zoom (195 and 201 px): no overflow, overlap or clipping, with a typed 3:45:00 shown in full.
2. **Order:** S6 and `verify-analytics` see exactly `hero, paths, stakes, guide, steps, stories, cta`.
3. **Contracts:** `verify-seo home-form` (the course options equal the planner's), the keypad colon on `#home-plan-goal`, and the GET form semantics (`units=km` only for km; an empty goal is omitted).
4. **Performance:** S8 lab CLS ≤ 0.1 and the autopilot-smoke home CLS median ≤ 0.25. Initial JS ≤ the WP0 figure + 1,536 B.
5. **Length:** 6 phone screens or fewer.
6. **Interactions:** the guess works by touch and keyboard, and Skip works. The deck swipes, and its arrows and progress agree. The replay pauses on its flag. Every nugget has a guard, a fallback and a `verify-nuggets` entry.

**Captures:** every profile, including `phone664`, `phone714` and `zoom`, and `--ix` (guess dragging, guess revealed, deck swiped to card 4, replay playing, replay at its flag, desktop hero).

### WP2: stories and chapter narratives

**Routes:** `/stories/{race-replay, pacing-types, places, final-kick, round-numbers, who-holds-pace, courses, race-morning}`, `/finish-times`.

**Owns:**
- `app/stories/[slug]/page.tsx`
- `components/story/**`, except `HeroReplay.tsx` (WP0-C) and `CourseArt.tsx` (WP5)
- `app/finish-times/**`, `components/FinishTimeSummary.tsx`, `lib/finish-times-summary.ts`
- `lib/stories.ts`, `lib/insights.ts` (client helpers)
- `lib/nuggets/stories.ts`
- `scripts/verify-insights.cjs`, `scripts/verify-finish-times.cjs`
- `app/styles/pages/story.css`, `app/styles/legacy/stories.css`

**May also edit:** `lib/analytics-policy.ts`, the `STORY_SLUGS` line only (adding `race-morning`), and its own `verify-analytics` entries.

**Builds:**
- §7.3 (`/finish-times`, race-replay), §7.5 (pacing-types), §7.6 (places), §7.7 (final-kick), §7.8 (round-numbers), §7.9 (who-holds-pace), §7.10 (courses) and §7.11 (race-morning);
- the per-story body split through `next/dynamic`;
- the removal of every literal selector listed in `nuggets.md` §4 from the bodies.

**Acceptance:**
1. On every story the reading is on the first phone screen.
2. 9 phone screens or fewer per story. At most one scrolly and at most one guess per page. The anchors are kept, or have alias stubs.
3. S2 `#my-finish` and `.which-card input` pass.
4. `verify-insights` and `verify-finish-times` pass, with the new beats recounted.
5. Each story's initial JS ≤ the WP0 figure + 1,536 B (expected to fall by 15–22 KB).
6. `/stories/race-morning` builds, has an `Article` JSON-LD and appears in the sitemap through `STORIES`.

**Captures:** every route with every profile, and `--ix`:
- each scrolly at steps 0, mid and final;
- the round-numbers lens toggled, the rescue guess revealed, your minute entered;
- the places gap scrub;
- Name that course answered;
- race-morning pairs tile tapped.

### WP3: analyses and `/slowdown`

**Routes:** the 11 analyses, the 2 weather stubs, `/slowdown`.

**Owns:**
- `app/analyses/[slug]/**`, `app/slowdown/**`
- `components/{AnalysisExplorer,AnalysisChart,CheckpointExplorer,AllFinisherAnalysis,FastStartAnalysis,WeatherAnalysis,QuestionViz,QuestionLineChart,ResearchQuestion,StudyFigure}.tsx`
- `components/tools/{RelatedTool,RelatedToolLink}.tsx`
- `lib/{analysis-*,ten-analyses,weather-catalog,weather-data,weather-display,weather-types,fast-start,fast-start-server,all-finisher-context,all-finisher-context-server,research-data,research-display,study-figures,chart-selection,section-labels,personalized,personalized-data,personalized-types}.ts`
- `lib/nuggets/analyses.ts`
- `scripts/verify-{ten-analyses,fast-start-client,all-finisher-context-client,weather,research,public-explorer}.cjs`
- `app/styles/pages/analysis.css`, `app/styles/legacy/analyses.css`

**May also edit:** its own `verify-analytics` entries (the page wrapper `.analysis-layout`) and its S2 analysis cases.

**Builds:**
- §7.4 to §7.13 for the analyses, and §7.7 for `/slowdown`;
- `QuestionViz` restyled with its classes kept; `QuestionLineChart` replaced by `LineProfile`;
- `WeatherAnalysis` without Recharts (`EffectBand`);
- the build-time defaults for checkpoint and hills;
- the weather tabs and the stubs.

**Acceptance:**
1. Every analysis opens on the finding H1 and its answer on the first phone screen. No form comes before it and no default is empty.
2. **Make it yours:** a sheet below 900 px and inline from 900 px. Every S2 label is kept and S2 analysis cases pass (including `analysis-url`).
3. 6 phone screens or fewer per analysis.
4. The Recharts chunk is absent from every analysis page and from `/slowdown` (bundle check). Initial JS ≤ the WP0 figure + 1,536 B, expected near −99 KB.
5. `verify-ten-analyses` (re-pinned regexes, count 10), `verify-fast-start-client`, `verify-all-finisher-context-client`, `verify-weather` and `verify-research` pass.
6. `/analyses/race-day-weather#wind` opens the Wind tab. The stubs forward with the hash.

**Captures:** all 13 URLs with every profile, and `--ix`:
- the sheet open on a phone;
- the inline panel on desktop;
- the U-curve mid-scrub and at a detent;
- onset chips changed;
- each weather tab;
- the checkpoint scrubber at the 50% detent.

### WP4: tools

**Routes:** `/tools` and every `/tools/*` page (10 tools, 2 pace charts, 5 goal pages, 6 qualifying race pages).

**Owns:**
- `app/tools/**`: pages, `layout.tsx` and every `*.css`. These move to `app/styles/pages/tools/*.css`, imported by the tools layout and pages.
- `components/tools/**`, except `EvidenceTag.tsx` (WP0-A) and `RelatedTool*` (WP3)
- `lib/tools/**`, `lib/nuggets/tools.ts`
- `scripts/verify-tools.cjs`

**May also edit:** its S2 and S6 tool cases. WP7 may edit `EVIDENCE_TEXT` in `lib/tools/registry.ts`, to read the count from `cohort_n` instead of the hard-coded "3.26 million".

**Builds:**
- §7.13 and §7.14;
- the goal bar made universal;
- per-tool hues removed;
- the course chooser's default sort;
- the split-check negative-width fix.

**Acceptance:**
1. Every S2 tool case, S6 tool signal and S7 projector case passes, along with `verify-tools`: share-bar text, handoff copy, `data-tool-controls`, `data-not-edit`, `BANNED` and badges.
2. Each tool's result reading is on the first or second phone screen in its default state, with no submit button.
3. Print previews of the plan and the pace band are unchanged (`emulateMedia('print')` capture).
4. 7 phone screens or fewer by default.
5. Initial JS ≤ the WP0 figure + 1,536 B.

**Captures:** every route with every profile, and `--ix`:
- the goal bar visible after scrolling;
- a typed goal with the keypad colon on a phone;
- the course chooser re-sorted;
- the weather-match thermometer dragged;
- the split check verdict with nine times;
- the qualifying result with a race expanded.

### WP5: courses

**Routes:** `/courses` and every `/courses/[city]`.

**Owns:**
- `app/courses/**`, `components/course/**`, `components/story/CourseArt.tsx`
- `lib/course-page.ts`, `lib/course-data.ts`, `lib/nuggets/courses.ts`
- `scripts/verify-courses.cjs`
- `app/styles/pages/{course,courses}.css` (from `app/courses/[city]/course.css`), `app/styles/legacy/courses.css`

**Builds:**
- §7.10 (`/courses` and `/courses/[city]`);
- the shared elevation scale (the maximum relief across the release, computed at build in `lib/course-page.ts`);
- "Shaped like {city}";
- the replay only where one exists.

**Acceptance:**
1. `verify-courses` and `verify-courses --html` pass for every course: SECTIONS order, TRACK ids, `data-k` facts, table regions, "Plan a {goal} {race}" names, no rank words.
2. S1 `nav.course-toc a[href="#goals"]` → `#goals tbody th a` → the planner → Back works. S8 CLS on `/courses/boston` ≤ 0.1.
3. Boston, Berlin and New York take 9 phone screens or fewer. Melbourne (no route) has no empty box. A course without a replay ships no replay chunk.
4. Guards: the range ends exclude held or partly loaded editions, and the hot/cool sentence needs a 5 °C gap.

**Captures:** `/courses`, `/courses/{boston,berlin,new-york,melbourne,chicago,valencia}` with every profile, and `--ix`:
- the year strip scrubbed;
- the elevation scrubbed;
- the goal set to 3:00;
- the replay switched to route view;
- the course-toc sticky mid-page.

### WP6: runners and the race report

**Routes:** `/runners`, `/report`.

**Owns:**
- `app/runners/**`, `app/report/**`
- `components/report/**`, `components/{RunnerSearch,RunnerContext}.tsx`
- `lib/{report,report-shared,report-image,runner-context,runner-search}.ts`: presentation only, with the data logic and verified contracts unchanged
- `scripts/verify-{report,runner-search,runner-context-ui}.cjs`
- `app/styles/pages/{report,runners}.css` (from `app/report/report.css` and `app/runners/runners.css`)

**Builds:** §7.12. Recharts comes out of `RunnerContext`.

**Acceptance:**
1. S3 passes in full, including the 1080×1350 PNG.
2. `verify-report`, `verify-runner-search` and `verify-runner-context-ui` pass in both units. The report's copy never says you, your, percentile, rank or record.
3. `/runners` initial JS ≤ the WP0 figure + 1,536 B, expected near −99 KB.
4. Neither page is ever recorded (S3 and `REPLAY_BLOCKED_PAGES`). Links out carry `via=runner`.

**Captures:** `/runners` empty, with results and with the context open (use the harness fixtures), and `/report?s=…` (the S3 fixture), with every profile. Plus `--ix`: the selection bar, the report export preview and the share sheet.

### WP7: contents, methodology and info pages

**Routes:** `/research`, `/stories` (the index), `/analyses` (the index), `/methodology`, `/about`, `/privacy`, `/request-analysis`, the 404 and error pages.

**Owns:**
- `app/research/(hub)/**`, `app/stories/page.tsx`, `app/analyses/page.tsx`
- `app/methodology/**`, `app/about/**`, `app/privacy/**`, `app/request-analysis/**`
- `app/not-found.tsx`, `app/error.tsx`, `app/global-error.tsx`
- `components/methods/**`
- `components/{StoryCards,AnalysisIndex,WeatherIndex,CohortNote,DataCoverage,AnalysisRequest,AnalyticsPreference,CreatorCredit}.tsx`
- `lib/unit-preference.ts`
- `scripts/e2e/scenarios/s1-browse.cjs`, the `unitSwitch()` function only
- `scripts/e2e/scenarios/s4-privacy-signals.cjs`, if needed
- `app/styles/pages/{research,methodology,info}.css`, `app/styles/legacy/{research,info}.css`

**May also edit:** `EVIDENCE_TEXT` in `lib/tools/registry.ts`.

**Builds:**
- §7.2 and §7.15;
- the new anchors `#story-race-morning` and `#archive`;
- the working units switch on `/methodology`.

**Acceptance:**
1. **S1 `unitSwitch()`, re-pinned:** `/research` opened directly has the working switch; pressing Kilometres turns the `#analyses` pace line from `/mi` to `/km` and adds `?units=km`; every page served with the placeholder still reads the same in both units.
2. `verify-seo` orphans pass: every story and analysis is linked from `/research`. Methods anchors pass, so every `howWeKnow` resolves.
3. `verify-weather` (`WeatherIndex`, About) and S4 privacy pass. The JSON-LD `Dataset` stays.
4. With details closed, `/methodology` takes 14 phone screens or fewer.
5. `CohortNote` lives only in `MethodsData` (`verify-tools`).

**Captures:** every route with every profile, and `--ix`: the methodology jump chips, the rail scroll-spy, a details block open, the units switch toggled on `/methodology` and on `/research`.

### WP8: legacy, redirects, sitemap and dead code

**Routes:** `/packs`, `/packs/[packId]`, `/research/personalized`, `/your-race`, `/htw`, `/packs/smyth_htw`, and the redirects for the weather slugs.

**Owns:**
- `app/packs/**`, `app/research/personalized/**`, `app/your-race/**`, `app/htw/**`
- `components/{PersonalizedGuide,LegacyAnalysisLink,HTWDashboard,PacingPreview,PackClientPage,QuestionsHome,FiltersBar,FigureCard,TableCard}.tsx`, `components/charts/**`, `components/tables/**`, `hooks/**`, `context/**`
- `lib/packs.ts`, `lib/seo-routes.ts` (until WP9 takes `CONTENT_DATES`), `app/sitemap.ts`, `lib/seo.tsx` (the breadcrumb helper: adds the chapter crumb), `vercel.json`
- `scripts/verify-seo.cjs`, `scripts/verify-personalized.cjs`
- `app/styles/legacy/packs.css` → `app/styles/pages/packs.css`

**May also edit:** its own `verify-analytics` entries (removing the `personalized-guide` per-file requirement).

**Builds:**
- §2.9 and §7.16;
- the stubs;
- the sitemap update (removals plus `/stories/race-morning`, which arrives automatically through `STORIES`);
- breadcrumbs with chapters;
- dead-code deletion (§6.2).

**Acceptance:**
1. `verify-seo` passes: sitemap, canonical, aliases (updated for stubs), robots, JSON-LD, duplicates, orphans and banned words.
2. Every 308 is in `vercel.json` and checked with a local redirect table test in `verify-seo`.
3. Every stub is noindex, forwards with the hash and carries a visible link.
4. `verify-compat` still passes after the deletions. No remaining import references a deleted file.
5. Primary packs render with the new primitives and their headings run in order.

**Captures:** `/packs`, `/packs/r10_unravel_typology`, `/packs/r01_banking_time`, one alias stub and `/research/personalized`, on phone and desktop.

### WP9: integration and release (last)

**Owns:**
- `scripts/e2e/budget.json` (final `--write-budget`)
- `scripts/e2e/scenarios/s8-budget.cjs` (the CLS list gains `/stories/round-numbers` and `/analyses/starting-pace`)
- `scripts/build-og-images.cjs`, `public/og/**`
- `lib/seo-routes.ts`, `CONTENT_DATES` only
- `app/styles/tokens.css`: the dark `@media` block
- `app/layout.tsx`: `themeColor` as an array
- `app/styles/legacy/**`: deletion
- `package.json`: removes `recharts` and the `@fontsource-variable/*` dependencies
- `docs/**`
- `app/design-system/page.tsx` (deleted, or kept by owner decision 14)

**Acceptance:**
1. **The full gate is green:**
   - `npm run verify:data`, `verify:analytics`, `verify:compat`, `build`, `verify:compat -- --build`, `verify:seo` and `verify:autopilot`;
   - `npm run autopilot:privacy` (S1–S8);
   - `npm run og:check`;
   - `node scripts/font-fallbacks.cjs --check`;
   - `verify-css` with no legacy exemptions;
   - `verify-nuggets`.
2. **The full sweep is clean:** `shoot.cjs` with every profile over the sweep list below, with no checklist items, and `lint-layout` clean on every sitemap page at 390 and 1440.
3. **Budgets are written** with a note that names the Recharts removal, the story and analysis splits and the shell. S8 CLS ≤ 0.1 on all five CLS pages.
4. **Dark mode is on** (owner decision 2) and every sweep page passes the dark checklist.
5. **Docs** are updated (§6.11), dated, with the measured results distinguished from the claims.
6. **The PR** follows `AGENTS.md`, and its description lists the owner decisions taken.

**The sweep list:**
- `/`, `/research`, `/stories`, `/analyses`, `/finish-times`, the 8 stories, the 11 analyses plus the 2 stubs, `/slowdown`
- `/courses`, `/courses/{boston,berlin,new-york,melbourne}`
- `/tools`, the 10 tools, the 2 pace charts, `/tools/marathon-pace/4-00`, `/tools/qualifying/boston`
- `/runners`, `/report?s=…`
- `/methodology`, `/about`, `/privacy`, `/request-analysis`
- `/packs`, `/packs/r10_unravel_typology`, one alias stub, `/404`

---

## 9. Owner decisions (each with the default this spec assumes)

| # | Decision | Default | Fallback |
|---|---|---|---|
| 1 | The replay band above the home title on phones | **Yes**: the first impression is the race, and it measures within S1 | One CSS `order` swap puts it below the doors (C's layout) |
| 2 | A dark theme that follows the OS, with no toggle and no storage key | **Yes**, switched on in WP9 after every package passes the dark checklist | Leave out the media block, and the site stays light |
| 3 | Split `/stories/race-morning` out of `/stories/courses`; merge warming and wind into race-day-weather tabs; 308 the two URLs | **Yes** | Keep the two analysis pages and add anchors |
| 4 | Mats named in both unit modes ("35–40K"), one-decimal miles in prose; re-pin `verify-units` and S1 | **Yes** | Keep the two-decimal mile conversions |
| 5 | Section tracking (`hero`, `chapter-n`, `related`) on stories, analyses and `/research` | **Yes**: no new ids, documented in `docs/ANALYTICS.md` | No tracking on those pages |
| 6 | A calmer Fraunces (opsz only, no SOFT or WONK); Bricolage only for figures | **Yes**: about −120 KB of fonts | Keep `full` Fraunces |
| 7 | Course names as labels on the extreme dots of strips, never in headline sentences | **Yes** | Unlabelled extremes; names in Values only |
| 8 | The fast-start fader colour moves from orange to `#8E4512` | **Yes** | Keep orange and accept the meaning clash |
| 9 | The fifth menu link keeps the text "Research" | **Yes** | "Contents" (an S1 mirror update) |
| 10 | Pack alias pages and `/research/personalized` become 308s with stubs | **Yes** | Keep them as they are |
| 11 | Retitle `/stories/final-kick` from its new lead finding; OG re-rendered | **Yes** | Keep "The finish-line magnet" (the magnet is now beat 5) |
| 12 | The receipt footer "Same race · same 5–20K pace" and the question deks count as insight copy | **Yes** | Remove the footer |
| 13 | Share cards are not counted in analytics | **Yes**: no new event | Add a `finding_shared` event (a policy change) |
| 14 | A noindex `/design-system` gallery during the build | **Yes**, deleted in WP9 | Keep it as living documentation |
| 15 | Story openers move from the night hero with pixel runners to a paper reading; the runners appear as data and in the CTA | **Yes** | A night opener band of 120 px at most above the reading |

---

## 10. Risks and how the plan handles them

| Risk | Mitigation |
|---|---|
| The new release lands mid-build and every number changes | Guards and fallbacks (§5); `verify-nuggets` against the real files; no literals; packages rebase on `feat/release-1652` |
| Shared-file conflicts across nine packages | The CSS legacy split is by owner (WP0-A); entry-only rules for three shared verifier files; pre-specified cross-package edits |
| The JS budget on simple pages (2.7 KB headroom) | The chapter list is server markup passed as props; the shell is measured at 1.4 KB or less; one `--write-budget` after WP0 |
| `position: sticky` scrollies break under an ancestor with `overflow: hidden` | `.bleed` and every container on a story path use `overflow: clip` only on the x axis, or `contain: paint` on the sticky's siblings; WP2 tests on iOS Safari emulation and old Safari (S5) |
| Old Safari (15.x) | No `@layer`, no `.at()`, `findLast`, `structuredClone` or lookbehind; `@supports` fallbacks for `linear()`, `color-mix()`, container units and `:has()`; S5 on every sitemap page |
| Font fallback regeneration needs the Liberation fonts | WP0-A installs them in its environment, or uses the CI image that `--check` already runs on |
| Masking regressions when markup moves | The tokens stay in their files (§6.6); S2 differential recordings; `verify-analytics` per-file entries |
| A headline and its chart disagree | Default control state = the headline's subject (Scrubber default detent, Segmented default); checklist item 16 |

---

## 11. Reference screenshots

All of them are in `final-refs/` in this folder, with two contact sheets:
- `final-refs/sheet-1-home-nav-story.png` (R01–R12)
- `final-refs/sheet-2-analysis-course-share-desktop.png` (R13–R24)

Each is the closest existing picture of a part of the final design. **"Take"** is what to copy. **"Change"** is what this spec does differently.

| Ref | File | Take | Change |
|---|---|---|---|
| R01 | `R01-home-first-screen-replay-first__A.png` | The 390×664 night hero layout: replay band, kicker, H1, form, button and doors, all above the fold | Draw the replay with rank lanes (R02), not the blob. Add the flag sentence under the band. Drop "Plan yours." from the H1. Doors as `.home-door-link` rows |
| R02 | `R02-replay-rank-lanes-and-flag__C.png` | Rank-lane replay, HUD layout, flag sentence and scrub row | Height `clamp(120px, 22svh, 200px)` in the home band. Pause on the flag. Token colours |
| R03 | `R03-guess-on-the-same-marks__A.png` | The guess drawn as rings on the same 100 dots as the truth | The truth in `--signal`, not blue. Dots 12 px and the grid 220 px or less. No raised card around it on paper |
| R04 | `R04-home-full-sections__C.png` | Home section rhythm: stakes reading, guide rows with readings, the 1–2–3 steps | Replace the dial with the reading plus the onset ShareBar. Guide rows gain the course line and markers (R07) |
| R05 | `R05-home-story-deck__B.png` | The deck energy: segmented progress, one big figure, one claim, the peek | Paper or night cards only (no plum or ember fields). Content-sized, never 100svh. **No dock** |
| R06 | `R06-contents-rows-with-readings__C.png` | Contents rows: number, title, subtitle, a reading on the right | The five doors stay exactly the pinned `#site-menu` (no "All laps"). Keys in Inter 13 sentence case with the approved wording (§2.2) |
| R07 | `R07-course-line-distance-markers__A.png` | The dashed course line with START, 5K, 10K, HALF, 30K and FINISH badges, and part headings | Fix the keys: "still crossed first", not "still won" |
| R08 | `R08-story-reading-opener__C.png` | The story opener: crumbs, H1, the question dek, then the reading (figure, unit line, sentence) | Bricolage figure instead of Inter 280. Crumbs carry the marker badge. Ticks 12 px or more |
| R09 | `R09-scrolly-steps-0-4__A.png` | The five-step towers scrolly: rise → curve → round minutes → busiest → zoom to 1.73× | Step text runs below the sticky graphic as plain paper text, not cards over the chart. It ends as the scrubbable lens chart (R10) |
| R10 | `R10-lens-readout-crown__C.png` | Lens Segmented, readout above, the drag handle below the ticks, a count against the curve | The key under the chart only for two or more encodings. Values row 48 px |
| R11 | `R11-guess-reveal-ruler__C.png` | The guess-first reveal: a ruler with the guess, truth and comparison, two cells, a verdict, mark chips | The guess as an orange **ring** and the truth as a signal **fill**. The panel is the page's one raised surface |
| R12 | `R12-desktop-scrolly__A.png` | Desktop scrolly: text column on the left, sticky graphic on the right | The step text without the left orange bar (kicker plus text only) |
| R13 | `R13-analysis-finding-h1-ledger__C.png` | Finding H1, question dek, ledger, sentence plus a ruler for 54% against 37% | The ledger becomes the night **receipt** (R14). The dek is the question, not "Measured against…" |
| R14 | `R14-race-receipt-goal-line__B.png` | The receipt form (zig-zag, tear lines, the result line) and the "for your goal" line | Night surface, not an ember field. Values in ink and night-ink, with only the result in signal (no blue or rose). **No dock** |
| R15 | `R15-u-curve-needle__C.png` | U-curve, needle, drag handle, best point, readout cells | The floating course pill at the bottom is the bug to avoid. Make it yours appears only over the explorer beat, with reserved padding |
| R16 | `R16-make-it-yours-sheet__A.png` | Bottom-sheet layout and thumb-friendly chips | Holds the **full** pinned form (course, "Finish time to explore", refinements, "Update comparison"). The title is "Make it yours" |
| R17 | `R17-course-night-hero-route__B.png` | Night course hero with the route as poster and the slowest section in signal | Moss becomes night. Add the reading and the year strip (R18). No dock and no goal bib |
| R18 | `R18-course-reading-year-strip__C.png` | Course reading (22%), sentence, scrubbable year strip | On night (`section.night`, `verify-courses`). A time-scaled x with "No race" gaps |
| R19 | `R19-what-makes-boston-boston__A.png` | Three "What makes {city} {city}" nuggets | Rows divided by hairlines, not shadowed cards. Inside `div.course-glance` |
| R20 | `R20-elevation-shared-scale-pace-blocks__A.png` | One height scale on every course, nine tappable pace blocks | Not in a card. The readout gives one climb value. The scrubber's drag handle sits below the axis |
| R21 | `R21-course-goals-weather-replay-footer__C.png` | Goal Segmented with cells, weather scatter as two facts, route and field replay, "Shaped like", footer | The dial becomes a DotGrid. Cells keep their labels in Inter (not mono caps) |
| R22 | `R22-share-card-4x5__B.png` | The 4:5 share card and the sheet (Save image, Copy link, Share…, the goal checkbox) | A night card instead of a gold field. The Bricolage figure at normal width (no 82% stretch) |
| R23 | `R23-desktop-layouts__C.png` | Desktop: home two-column hero with the replay, the story reading next to the sentence, the analysis rail, the course hero with the route | The rail from 1180 px. Five inline links in the header |
| R24 | `R24-dark-mode__C.png` | A chosen dark palette for a story | Token values from §3.1. Ships in WP9 |

**Anti-references** (do not reproduce):
- B's fixed bottom dock covering the receipt's goal line (bottom of R14).
- C's floating course pill over body text (bottom of R15).
- A's cards nested inside cards (R19, R20).
- B's 100svh cards with empty voids (`concepts/B-wrapped/shots/home-phone-full.png`).

The live-site problems these address are in `critique.md`, with screenshots in `shots/live/`.

---

## 12. Every problem the judges raised, and its fix

| Judge · direction | Problem | Fix in this spec |
|---|---|---|
| J1 · C | Too quiet, monochrome, low emotional pull | Bricolage figures; night race and answer bands; pacing-type colours kept; the story deck; share cards; pixel runners as data (ghost races, CTA); the home hero opens on the replay (§0, §3.1, §3.2, §7.1) |
| J1 · C | The home first screen is a form, not a fact | The replay band with its flag sentence above the title on phones (§7.1, owner decision 1) |
| J1 · C | Cushion headline mismatches its default chip | The default control state is always the headline's subject (Scrubber and Segmented rules §3.5; checklist item 16) |
| J1 · C | The analysis dek sits close to method copy | The dek is the question. The comparison is the receipt footer only (owner decision 12) |
| J1 · C | "30% began at the 20K mat" | "began in the 20–25K section" (§7.4) and the approved keys (§2.2) |
| J2 · C | Ticks at 10.5–11.5 px | A 12 px minimum everywhere, enforced by `lint-layout` and `verify-css` (§3.2, §8.0) |
| J2 · C | Empty onset box with its label dropped | 0% segments are not drawn and are listed in Values; labels move below with a leader when a segment is under 46 px (§3.6 ShareBar) |
| J2 · C | Two foot values side by side in the elevation readout | One value per readout key (§3.6 elevation, §7.10) |
| J2 · C | The dial spends a screen on one number | Dial dropped; DotGrid of 220 px or less, or a Ruler (§3.5) |
| J2 · C | +5:00 in the hero against +5:02 at the detent | The default detent is the headline's band; the readout shows that band's value (§3.5 Scrubber) |
| J3 · C | Menu rename to "All laps" breaks S1 | "Research" is kept; the chapter list sits outside `#site-menu` (§2.4, owner decision 9) |
| J3 · C | `fill-quiet` at 1.55:1 and context marks near 3:1 | Context marks at 3.50:1 or more; fills carry a 3:1 edge (§3.1) |
| J3 · C | Copy slips: "faster 2nd half", "negative split", "came from" | The approved keys (§2.2); association verbs only; banned list (§3.10) |
| J3 · C | The floating dock covers text | Make it yours appears only over its explorer beat, with reserved padding; inline from 900 px; inline under 360 px (§3.5) |
| J3 · C | Big palette and OG migration cost | Legacy tokens keep their values; OG `TOKENS` unchanged; the types palette is re-stepped rather than removed; `PACE_RAMP` kept for heatmaps (§3.1) |
| J3 · C | Naming the extremes is an open decision | Labels on strip dots only, never in headlines (owner decision 7) |
| J1 · A | The story runs 12.3 screens with no number on its first screen | Reading opener on the first screen; 9 screens or fewer; the scrolly takes about 3 (§4.1, §7.8) |
| J1, J2 · A | Cards in cards, everything boxed | One surface level plus one raised surface; beats unboxed; scrolly text below the graphic, not in cards (§1.8, §3.5) |
| J1, J2 · A | Label collisions ("same as peer\|s", "+328 ft" over the line) | `placeLabels()` plus the `lint-layout` overlap check (§3.5 Annotation, §8.0) |
| J1, J2 · A | Frozen empty replay frames ("0% / 0%") | The replay opens on its flag frame with a server poster; pauses there (§3.6 replay) |
| J2 · A | Loud hierarchy (Fraunces 640, Bricolage 800, orange kickers everywhere) | Fraunces 440; one figure-xl per page; ink-3 kickers only at beat heads (§3.2) |
| J2 · A | The answer card repeats the ledger in a paragraph | No paragraph inside a receipt; the page doesn't restate it (§3.5 Receipt) |
| J2 · A | 3.5 million on one page, 3.4 million on the next | `siteTotals()`, one family per surface; `verify-nuggets` checks (§5) |
| J2 · A | Desktop analysis column in an empty 1440 frame | Two-column heroes, figures to 52 rem, the rail from 1180 px (§2.5) |
| J3 · A | Orange means both "you" and "slower" | Orange fill = the reading; orange ring = you; slower is never orange (§1.3, §3.1) |
| J3 · A | Menu labels misstate stats on every page | Approved keys reproduced exactly (§2.2) |
| J3 · A | The sheet drops the pinned starting-pace filters | Make it yours holds the page's whole existing form, inline from 900 px for S2 (§3.5) |
| J3 · A | A bespoke scrolly per chapter is costly | One shared `Scrolly` component, at most one per story, none on analyses (§3.5) |
| J3 · A | U-curve gated behind the guess | The answer is already in the receipt; "Skip, show me"; no guess on a number the H1 states (§3.5 GuessFirst) |
| J3 · A | "26 of 28 courses" next to "Across 22 courses" | One course-count per surface, from the same nugget cohort (§3.10) |
| J3 · A | Course order re-pin | Not needed: the order is kept exactly (§4.3) |
| J1 · B | The dock covers buttons, axes and links | No persistent dock anywhere (§0) |
| J1, J2 · B | 100svh cards leave dead space | Content-sized cards; checklist item 10 (§3.5 NuggetCard) |
| J1 · B | Low-contrast greys on night in the onset bars | Night ordinal ramp validated; night context marks at 3.87:1 (§3.1) |
| J1 · B | "1 in 26" here, "1 in 25" there | `inWords()` with a fixed denominator list, in one module (§3.10, §5) |
| J2 · B | Twelve field colours, no restraint | Paper and night only; data colours only for data (§3.1) |
| J2 · B | Giant numerals collide | Normal width, −0.035em tracking, the overlap lint (§3.2) |
| J2 · B | Its own colour rules broken on the Boston page | One palette with fixed jobs; `verify-css` bans raw colours outside tokens (§6.1) |
| J3 · B | Missing keypad hint, `nav.course-toc`, `#goals`, `#my-finish` | All kept (§6.7) |
| J3 · B | Course tracking ids reassigned | Kept exactly (§4.3, §6.5) |
| J3 · B | New storage key and new masked class (unapplied) | None; `GuessFirst` reuses `.which-card`; the goal travels only in the URL (§6.6) |
| J3 · B | Root JS over its headroom | Shell at 1.4 KB or less; the chapter list as server props (§6.4) |
| J3 · B | Dock over titles at 200% zoom | Nothing fixed at the bottom on stories; the chip goes inline under 360 px (§3.4, §3.5) |
| J3 · B | The goal reframes shares as personal odds | Goal sentences say "of 100 finishes on {goal} pace…", never "you" or "odds" (§3.10) |
| J3 · B | Year columns with no 2020–21 gap | Time-scaled year axes with "No race" gaps (§3.6) |
| J3 · B | "Came from" (causal) | Association verbs only, checked by `verify-nuggets` (§3.10, §5) |
