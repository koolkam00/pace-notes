# Design system

The site's design system: how a page is built, how it ends, its type, colour, space, components and copy rules, how it is checked, and how a visual change is reviewed. It describes the code on `main`. The redesign that set it merged as `c6744791` (#71) on October 20, 2026; later work (the Top 100 charts, the terrain splits, the half marathon) follows it. What is deployed is in the [project handoff](PROJECT_HANDOFF.md#current-state).

The owner's direction of October 17, 2026 wins every conflict: "focus on amazing design, simple is beautiful; you can delete anything you feel is too cluttered, old or doesn't contribute to making this as good and as beautiful as possible." ([owner decisions](OWNER_DECISIONS.md)). Every element must help a runner learn the page's finding or act on it; anything else is deleted, not hidden. The redesign spec that this page condenses is kept as it was in [history](history/redesign-2026-10/DESIGN-SPEC.md); code comments that cite "the redesign spec, section N" mean that file. Earlier versions of this page are in Git history.

## The page

- **A page opens on its reading.** The chapter crumbs, an H1 that is the finding (one italic accent), a dek only where it adds something (never the H1 restated as a question; the question lives in the title and description), then one figure with its sentence (`components/ui/Reading.tsx`; an analysis opens on its night answer card instead, `components/analysis/Shell.tsx`). No page opens on a form or an empty state, and a tool's result card is on its first phone screen.
- **One H1 size.** Home sets its H1 in `t-display` (since October 22, 2026 with a 34 px floor under about 382 px instead of the token's 36, so the miles title keeps two lines at 360 px and the line under it, which says what Pace Notes is, still fits the first screen); every other page (stories, analyses, `/finish-times`, `/slowdown`, hubs, tools, course pages and the info pages) in `t-title`, 68 px at 1440. A hub's H1 sits in its left column (5/12 from 900 px) and is sized to it only where that column is narrow.
- **Beats.** After the reading, at most a few beats, each one finding as its H2 (one clause, at most 12 words: `verify-chapters` rule 9) over one figure and at most two sentences. Beats are separated by whitespace and a hairline, never by boxes. A page says each number once: the card into it, its H1 accent and the figure under the H1 never repeat one another (`verify-chapters` rule 10).
- **Night is the race and the answer.** Dark surfaces (`.night`) mean the replay, the home and course heroes, the analysis answer, a tool's result card and the next card. Never a form, a caption or a promo.
- **Orange is the reading; a ring is you.** A filled signal mark is the one thing the sentence is about; the reader's own guess, goal or time is an open ring; everything else is ink, quiet grey or a validated data colour. "Slower" is never orange. Only the H1's italic accent is orange; a beat H2 keeps its italic in ink (`.t-h2 em`), and the marks under it carry the signal. A null finding's accent is ink italic (`NULL_FINDINGS`). The layout linter fails two coloured heading accents within one screen (check 9) and a term link inside an H1 (check 10).
- **Budgets** (phone screens of 844 px): home 4.5, story 6, analysis 4, course page 7, tool 5 (its result within 3), hubs 4, info pages 2.5, `/methodology` with its folds closed 10. No check enforces them: `scripts/design/shoot.cjs` prints each capture's height in screens (`screens=`, the page's height over the viewport's) and the reviewer compares it with the budget.

## How a page ends, and the one way to its methods

- **The closing stack** (`components/ChapterEnd.tsx`): the night next card with the next page's reading (`NextCard.tsx`; the finish card on `/tools/plan`), one row with the way back, then "Was this useful?". One way forward and one way back. Every page in the race ends on it: stories, analyses, `/finish-times`, `/slowdown`, tools, `/courses` and each course page, `/runners` and `/report`. A reference tool ends on "← All tools" (`ToolEnd`). The hubs (`/research`, `/stories`, `/analyses`, `/tools`) end at their list.
- **One pattern for the methods link** (October 20, 2026). A page whose figures sit in an "All numbers" fold ends that fold on "How these were measured →" (`Values` or `AllNumbers` `how`, `CourseNumbers` on the course pages, `withHow` for a table built by an explorer, `HeroSwap slot="values" how` so a Make it yours selection keeps it), and its closing row is the way back alone (`ChapterEnd how={false}`, `AnalysisShell numbers`, `ToolEnd numbers`). That is every story, `/finish-times`, `/slowdown`, ten of the eleven analyses (each race-day weather tab carries it), every course page, the planner, the pace band, weather match and the five goal pages. A page without such a fold keeps "How we know →" in its closing row: finding improvement, `/courses`, `/runners`, `/report`, the predictor, projector, course chooser and pace charts, and the four tools whose only fold holds the visitor's own calculation or official standards (split check, pace calculator, the qualifying checker and its Boston page). Where the row carries it, the footer's own link to `/methodology` steps aside (`footer.css`, `:has()`), so a screen never shows two. `verify-chapters` rule 11 checks the export: never both, never two anchors, and no "All numbers" page outside that short list with the row link.

## Type

Three faces, self-hosted from `public/fonts/` (copied from the `@fontsource-variable` packages by `scripts/fonts/copy-fonts.cjs`, which `npm run build` runs first so a build under `NEXT_PUBLIC_BASE_PATH` writes base-path font URLs; `app/styles/fonts.css`; each with metric-matched fallbacks from `scripts/font-fallbacks.cjs`, regenerated when headings change, `font-fallbacks --check`):

| Face | Token | Use |
| --- | --- | --- |
| Fraunces 440 (wght and opsz axes only) | `--serif` | Headings, the reading's sentence, beat titles; the italic accent (`<em>`, `--signal-ink`) |
| Inter | `--sans` | Text, controls, labels, kickers, ticks and readouts |
| Bricolage Grotesque 660 | `--figure` (`--bib`) | The reading figure only (`components/ui/BigNumber.tsx`, the answer cells, the goal bar) |

Code (`<code>`, which only `/methodology` shows) uses the system monospace stack, `--code`. The scale is in `app/styles/tokens.css` and the classes in `base.css`: `.t-display`, `.t-title`, `.t-h2`, `.t-sentence`, `.t-body`, `.t-small`, `.t-label`, `.t-direct`, `.t-kicker`, `.t-tick` and `.t-readout`, with `--t-figure-xl/l/m/s` for big numbers. From 900 px a story beat's dek and a reading's unit line are body size (18 px) and readout keys 15 px. Nothing on a chart or a control is under 12 px (`verify-css` rule 3). Headings balance their lines (`text-wrap: balance`), so no heading ends on one orphan word. Mono caps are used only for kickers and the marker badges, never for row labels, legends or readout keys.

## Colour

Only `app/styles/tokens.css` holds colour literals (`verify-css` rule 1). Three scopes:

- `:root`, the light page: `--paper` #F5F0E6, `--ink` #15171C (with `--ink-2`, `--ink-3`), hairlines `--rule`/`--rule-strong`, quiet marks `--mark-quiet` (3.5:1) and `--fill-quiet` (always with a `--mark-quiet` edge, `verify-css` rule 7), the reading `--signal` #E5461A (`--signal-ink` for text), the primary button and brand mark `--accent` #FF5B2E, and a one-hue ordinal ramp `--ordinal-1…4`.
- `.night`, the race and the answer at any theme: the same names take their night values, so a component written with `--ink` or `--signal` reads on either surface.
- **Dark**, the page theme under the reader's system setting (the redesign spec's default 2, taken; it is a default, not an owner decision: [register](OWNER_DECISIONS.md#defaults-not-owner-decisions)): no toggle and nothing stored. The dark values sit twice in `tokens.css`, under `[data-theme="dark"]` and under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`, and every component rule written for the attribute has its twin under the media query (`verify-css` rule 9). Night bands step to `#07090C`; a night card on the dark page takes a hairline ring from `--night-edge`. The viewport `themeColor` is a light and dark pair (`app/layout.tsx`). Share images and OG cards keep their own night palette.

Data colours: the diverging pace ramp (`PACE_RAMP` in `lib/viz/format.ts`, for heatmaps only, every warm stop at OKLab ΔE ≥ 15 from every signal, `verify-css` rule 8) and the six pacing-type colours with their night set (`lib/viz/palette.ts`, `typeStyle()`).

## Space and layout

Spacing `--s-1…10`, the beat, head and figure gaps, radii `--r-xs…pill`, two shadows (`--shadow-raise`, `--shadow-sheet`), motion durations and eases, and the z-index layers are tokens. Three breakpoints: 600 px, 900 px and 1180 px (the chapter rail); 299.98 px and 359.98 px only for 200% zoom and small phones. The side gutter is `--gutter` (16 px on a phone, up to 48 px). Page tops share `--page-top` (16 px on a phone, 32 px from 900 px), so a crumb and H1 land at the same height on every template.

## Components

- **Shell:** `SiteHeader` (Menu opens `MenuSheet`, from 1180 px the five links and a Chapters drawer; the filled "Plan your race" is the one orange control of a screen), `ReadingBar.client.tsx` (minutes left and a tick per beat), `ChapterRail` from 1180 px beside the stories, analyses, `/finish-times` and `/slowdown`, and through `ChainFrame` beside the chain's tools, the goal pages, `/runners` and `/report` (the crumb above the H1 is hidden beside it, so the chapter is named once per screen; the course pages and hubs have none), `SiteFooter` (brand line, one row of four links at 390 px, the Motion switch).
- **Chapters:** `lib/chapters.ts` registers eleven chapters in three parts with their pages, readings and methods anchors (`scripts/verify-chapters.cjs`). `ChapterCrumbs` (`components/ui/ChapterHeader.tsx`) is the one chapter line on every page in the race: the marker badge, "Chapter 06 · The finish line" (a chapter after the finish shows its number once, on the badge), and from 600 px the place ("Page 1 of 2"). `ChapterList.tsx` draws the chapters on their dashed course line in the menu, the home guide and the contents. A chapter may list a hub that is not a step of the chain: chapter 08's is `/courses`.
- **Readings and answers:** `Reading`, `BigNumber`, `Receipt`, the analysis `AnswerCard` (the night card holds the answer only; its "All numbers" sits on paper directly under it, and a Make it yours row that redraws the card sits between them, `explore`), the tool result card (`.tool-reading`, its foot row the badge and Copy link, `ReadingFoot`), `DataLead` (a tool that opens on Pace Notes data leads with it on paper above the visitor's own card) and `Values` (every chart's table twin, closed by default, its summary "All numbers · N rows"). A story, `/finish-times` and `/slowdown` gather their tables at the foot in one `AllNumbers` ("All numbers · N tables"), the course pages in `CourseNumbers`. `verify-ten-analyses` fails a `Values` fold inside a night card. Make it yours redraws the page's own answer instead of drawing a second chart (`HeroSwap`, `components/analysis/hero-event.ts`): a selection replaces the card's kicker, chart and "All numbers", and one quiet line under the dek says what the card shows (`HeroSwap slot="scope"`).
- **Charts** (`components/viz/`, server-drawn SVG coloured from tokens): `ChartFrame`, `Readout`, `Axis`, `Annotation` and the forms `LineProfile`, `Histogram`, `Columns`, `DotStrip`, `DotGrid` (with its `.dot-grid-key`: lit and unlit named once), `Waffle`, `ShareBar`, `Ruler`, `Dumbbell`, `Cdf`, `Scatter` (the pair the sentence compares inked and labelled; a point the sentence names outside the pair, such as a course's "Apart from 2022", takes a quiet label, `named`), `Waterfall`, `YearStrip`, `ElevationPace` and `TypeGlyph`. `Scrubber.client.tsx` is the one touch control (a needle or a pick, 1:1 with the thumb, detents at the values the headline names, the readout above the plot, the signal dot where the needle meets the line). Labels are placed clear of marks and of the resting needle; below the reference width a label the needle would cross carries the width class that hides it (`lint-layout` checks 11 and 12). The replay is `ReplayPoster` at build and `ReplayStage.client.tsx` loading the canvas (`RaceReplay.tsx`) near the viewport.
- **Controls:** `Segmented.client.tsx`, `Chips.client.tsx`, `GuessFirst.client.tsx` (at most one per page), `Scrolly.client.tsx` (at most one per story), `MakeItYours.client.tsx` on `Sheet.client.tsx`, the tools' `Stepper`, `DurationField` and `GoalBar` (`components/tools/ui.tsx`; on a phone the goal bar floats at the foot of the screen, takes no room in the page, and shows only between the inputs and the closing stack, away while an actions row or an open table is on screen), and `components/tools/EvidenceTag.tsx` (the only file that draws evidence badges).
- **Units:** `components/ui/ByUnits.client.tsx` shows the server-drawn miles or kilometres version of a sentence, receipt or chart; `UnitsProvider` holds the switch. Miles are the default.
- **Moved addresses:** `components/MovedPage.tsx` with `LegacyAnalysisLink.tsx`: one heading, one plain sentence saying where the page went ("Warming through the race now has its own tab in race-day weather."), one outline button ([SEO](SEO.md#moved-addresses-october-18-2026)).
- **Info pages** (`app/styles/pages/info.css`): an H1, one dek, then short sections divided by hairlines at the reading measure, ending on `InfoNext`. `/privacy`'s short facts (`.info-facts`) also open `/methodology` (its four-fact short version, October 22, 2026), and `/about` opens on its ways in (`.info-ways`: one row per visitor goal over the page that answers it, the `/tools` row's shape). `/about` measures 2.32 phone screens of its 2.5 (October 22, 2026, after the owner's additions to How it is made; 2.22 before them and 1.49 with who and why only).

## Motion and accessibility

Only transform and opacity animate, and only where motion explains (the replay, a scrub, the reveal of an answer); durations scale with `--motion`, which is 0 under reduced motion and the footer's Motion switch. Every interactive element is at least 44 × 44 px (`scripts/design/lint-layout.cjs`), focus is a 2 px `--focus` ring (`--focus-paper` where a night card's ring is drawn outside it on paper), every chart has a label that states its finding and a table twin, and grey text holds 4.5:1 and marks 3:1 in both themes.

## Copy and numbers

Every figure and directional word comes from a field through `lib/nuggets/` with a guard and a neutral fallback (`scripts/verify-nuggets.cjs` recounts each one independently; no placeholders remain). Insights only on pages; methods, sources and limits live on `/methodology`, and "sustained slowdown" links to `/methodology#sustained-slowdown`. Shares are "of finishes", never "your chance"; the site never says "arithmetic". Number ranges never break at their dash (`joinRanges` in `components/ui/keepTogether.tsx`). Every page title ends " | Pace Notes" unless the suffix would take it past 60 characters or the title already names the brand (`verify-seo` `title-brand`).

## Checks

`node scripts/verify-css.cjs` (tokens, breakpoints, chart text, quiet edges, compatibility, the pace ramp and dark parity; `npm run verify:data` runs it, and `npm run verify:css` adds its self-test and `copy-fonts --check`), `scripts/verify-chapters.cjs` (the chain, the readings, number once and the methods pattern; `--html` after a build checks the export), `scripts/verify-nuggets.cjs` (every reading recounted with its guard), `scripts/design/shoot.cjs`, `scripts/design/lint-layout.cjs`, `scripts/design/interactions.cjs` and `scripts/design/sheet.py` ([visual review](#visual-review), below). The design scripts and `verify-chapters --html` run only locally; [operations](OPERATIONS.md#checks-by-change-type) lists which checks CI runs. The `/design-system` gallery was deleted at integration (the redesign spec's default 14, taken), and the temporary working notes under `docs/redesign-work/` were deleted at release preparation (October 20, 2026); the spec among them is kept in [history](history/redesign-2026-10/DESIGN-SPEC.md).

## Visual review

A change that alters what a page shows is reviewed from captures of the built site, by readers who did not make it, until a fresh round finds nothing serious. The redesign took six integration rounds ([handoff history](history/handoff-2026-10-redesign.md)) and the half-marathon pages five, then another independent review after the stamp correction ([handoff history](history/handoff-2026-10-20-to-30.md#half-marathons-a-page-a-story-and-the-tools-october-2930-2026)); budget four or five rounds for a new section, and review again after any later change to its data or code. Most findings in those rounds were labels colliding at 320 px and at 200% zoom, two numbers on one screen that did not add up, and sentences that named the wrong group.

### Capture

The scripts serve the static export in `out/` inside Playwright's routing (no port is opened and every other host is refused, so a capture never reaches analytics). They need Playwright's Chromium (`npx playwright install chromium`; `PLAYWRIGHT_CHROMIUM_PATH` points them at another binary) and, for the sheets, Python with Pillow. Run them one at a time on a small machine.

```bash
npm run build                                                    # writes out/
node scripts/design/lint-layout.cjs --routes=<list|@file> --widths=195,320,390,1440   # add 1024 for tool routes
node scripts/design/shoot.cjs --routes=@routes.txt --profiles=all --ix --out=<dir>
python3 scripts/design/sheet.py sheets <dir>                     # one contact sheet per route; `strips` cuts full pages into screens
python3 scripts/design/sheet.py diff <before> <after>            # pixel diff of two capture folders
```

`--routes` takes a comma list or `@file` (one route per line, `#` comments allowed); without it both scripts stop ("--routes is required"), so `npm run design:lint` and `npm run design:shoot` need `-- --routes=…`. The matrix is the one `shoot.cjs` defines in `PROFILES`:

| Profile | Viewport | Captures | Routes under `--profiles=all` |
| --- | --- | --- | --- |
| `phone` | 390 × 844, device scale 2, touch | first screen and full page | all |
| `phone664`, `phone714` | 390 × 664, 402 × 714 | first screen | home only |
| `desktop` | 1440 × 900 | first screen and full page | all |
| `tablet` | 1024 × 768 | first screen and full page | `/tools/*` only |
| `dark` | the phone, system setting dark | first screen and full page | all |
| `reduced` | the phone, reduced motion | full page | all |
| `km` | the phone, `?units=km` | first screen | all |
| `zoom` | 195 × 332 (the 390 phone at 200% zoom) | first screen | all |

`--ix` adds the interaction captures of `scripts/design/interactions.cjs` on the phone, desktop and zoom profiles (menu, sheet, scrubs to a detent, the guess before and after, segments, the replay at its flag, folds open); a page without the control records "n/a". For a before-and-after diff, capture both with `--mask=canvas,.replay-hud` so the replay's moving parts compare equal. The layout linter's thirteen checks are listed at the top of `lint-layout.cjs`; it lints each width at its own height (195 × 332, 320 × 640, 390 × 844, 1024 × 768, 1440 × 900).

The matrix has gaps: no real WebKit or iOS device (Playwright's WebKit is not installed; [older browsers](WEBSITE_ARCHITECTURE.md#older-browsers-and-error-pages)), dark only at phone width, and no 320 px capture profile (the linter covers 320). Add what a change needs: a 320 × 568 phone and a 195 × 422 zoom found most of the half pages' collisions; scrubbers at their first, home and last points; a guess before, made and revealed; every state of a tool (empty, typed, too few, each chip).

### Critics, skeptics and the exit rule

1. **Critics, one per lens**, each given the captures, the routes and the published JSON, and none of them the author:
   - a first-time reader on a phone: what is the finding, what would they do next, what confused them;
   - numbers and rules: recompute every printed number from the published JSON, never trusting a verifier's pass, and check every count against its floor and every word against the rules in [AGENTS.md](../AGENTS.md);
   - data-viz design: one reading per chart, orange only for the reading, labels clear of marks, the "looks off" list in the [redesign spec](history/redesign-2026-10/DESIGN-SPEC.md#80-rules-every-package-follows) (section 8.0);
   - interaction and accessibility: keyboard, focus, ARIA names, contrast in both themes, the page with JavaScript off;
   - editor: one takeaway per beat, no causal wording, and agreement with the figures the site prints elsewhere.
2. **Severity.** P1: the page states something false or misleading, breaks a rule, or cannot be used (a crash, a cut-off control, an unreadable chart). P2: a reader would notice and be slowed or confused (a collision, numbers that do not add up, a sentence naming the wrong group). P3: polish.
3. **One skeptic per finding**, a separate agent that tries to refute it against the captures, the code and the data before anyone fixes it. A finding that does not survive is dropped; one that does is fixed at its root, with a check where a check can hold it.
4. **Fix, rebuild and capture again**, then start a fresh round with new critics.
5. **Exit only when a fresh, independent round finds no P1 or P2.** A round judged by the agent that made the fixes does not count. The half pages' fifth round was judged by the fixing agent alone, with no panel of critics; the next independent review, of the build after the stamp correction, found a P1 (a floor lowered with no decision behind it) and a P2 (a story figure, repeated in four places, still stating the reading its guard had rejected).

Keep the critiques and contact sheets in the pull request description, not in the repository.

### Copy checks

- **Two numbers on one screen must add up.** Derive each displayed difference from the displayed values, not from unrounded data: the half story's readout prints the typical marathon and its minutes over double the half from the same rounded window (`windowOverDouble` in `lib/tools/half-to-full.ts`); before that, a 2:45 half read "Typical 5:57" beside "+30 over double". Where a verifier can, recompute each table row from its own printed cells.
- **One measure per beat, or name both.** A pooled share beside a per-window share reads as a contradiction ("8% came in under double" beside "23 in 100" at a 2:45 half) unless the page says which is which.
- **Every slot a failed guard feeds falls back.** When a nugget's guard fails (`sentenceOf` in `lib/nuggets/core.ts` gives the neutral fallback), nothing on the page may still state the rejected reading: not the H1, the figure and each place it is repeated (chapter rows on `/` and `/research`, next cards, night cards), the dek, a caption, the table row marked as the reading, the chart's signal mark or the share card. The figure states a reading only under a guard of its own, otherwise a neutral count. Recount each slot in the nugget's recount (`scripts/nuggets/*.cjs`).
- **Name recorded sex wherever a sex filter applies.** With a recorded-sex chip pressed or `sx=` in a shared link, every sentence the filter changes says "recorded women's" or "recorded men's", so a shared link never reads as all marathons.
- The rules every page already keeps are in [copy and numbers](#copy-and-numbers): figures from nuggets, shares "of finishes", no "your chance", no "arithmetic", no release tags in visible copy.

## Touching tokens, fonts or units

The Top 100 and half-marathon share cards are stamped with a hash of everything they are drawn from, including `app/styles/tokens.css`, `app/styles/fonts.css`, `lib/units.ts`, `lib/nuggets/format.ts` and the chart code (`CODE` in `scripts/build-chart-cards.cjs`). A change to any of them makes every card stale, and `npm run verify:data` fails on both `--check` runs. Re-stamp both sets (`node scripts/build-chart-cards.cjs`, then `node scripts/build-chart-cards.cjs --set half`), run each again with `--check`, open the PNGs, and run `npm run og:check` (the Open Graph cards copy the colour tokens; no CI job runs it). [Top 100 charts](TOP_100_CHARTS.md) describes the cards.
