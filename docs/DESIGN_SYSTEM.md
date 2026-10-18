# Design system

Rewritten October 18, 2026 from the redesign spec (section 3) and the code on `feat/redesign` after the three lanes were integrated (branch state; not yet on main or the live site). The owner's rule wins every conflict: **simple is beautiful**. Every element must help a runner learn the page's finding or act on it; anything else is deleted, not hidden.

## The page

- **A page opens on its reading.** The crumbs, an H1 that is the finding (one italic accent), the question as a dek, then one figure with its sentence (`components/ui/Reading.tsx`; analyses open on their answer card instead, `components/analysis/Shell.tsx`). No page opens on a form or an empty state.
- **Beats.** After the reading, at most a few beats, each one finding as its H2 over one figure and at most two sentences. Beats are separated by whitespace and a hairline, never by boxes.
- **Night is the race and the answer.** Dark surfaces (`.night`) mean the replay, the home and course heroes, the analysis answer, a tool's result card and the next card. Never a form, a caption or a promo.
- **Orange is the reading; a ring is you.** A filled signal mark is the one thing the sentence is about; the reader's own guess, goal or time is an open ring; everything else is ink, quiet grey or a validated data colour. "Slower" is never orange.
- **The closing stack** (`components/ChapterEnd.tsx`): the night next card with the next page's reading (`NextCard.tsx`; the finish card on `/tools/plan`), one row with the way back and "How we know ↗", then "Was this useful?". One way forward and one way back. Every page in the race ends on it: stories, analyses, `/slowdown`, tools, `/courses` and each course page, `/runners` and `/report`.
- **Budgets** (phone screens of 844 px): home 4.5, story 6, analysis 4, course page 7, tool 5 (its result within 3), hubs 4, `/methodology` with its folds closed 10.

## Type

Three faces, self-hosted from `public/fonts/` (copied from the `@fontsource-variable` packages by `scripts/fonts/copy-fonts.cjs`; `app/styles/fonts.css`; each with a metric-matched fallback from `scripts/font-fallbacks.cjs`):

| Face | Token | Use |
| --- | --- | --- |
| Fraunces 440 (wght and opsz axes only) | `--serif` | Headings, the reading's sentence, beat titles; the italic accent (`<em>`, `--signal-ink`) |
| Inter | `--sans` | Text, controls, labels, kickers, ticks and readouts |
| Bricolage Grotesque 660 | `--figure` | The reading figure only (`components/ui/BigNumber.tsx`) |

Code (`<code>`, which only `/methodology` shows) uses the system monospace stack, `--code`; JetBrains Mono and its `--mono` token were dropped with the legacy sheets in WP9 (October 18, 2026). The scale is in `app/styles/tokens.css` and the classes in `base.css`: `.t-display`, `.t-title`, `.t-h2`, `.t-sentence`, `.t-body`, `.t-small`, `.t-label`, `.t-direct`, `.t-kicker`, `.t-tick` and `.t-readout`, with `--t-figure-xl/l/m/s` for big numbers. Nothing on a chart or a control is under 12 px (`verify-css` rule 3). Headings balance their lines (`text-wrap: balance`), so no heading ends on one orphan word.

## Colour

Only `app/styles/tokens.css` holds colour literals (`verify-css` rule 1). Three scopes:

- `:root`, the light page: `--paper` #F5F0E6, `--ink` #15171C (with `--ink-2`, `--ink-3`), hairlines `--rule`/`--rule-strong`, quiet marks `--mark-quiet` (3.5:1) and `--fill-quiet` (always with a `--mark-quiet` edge, `verify-css` rule 7), the reading `--signal` #E5461A (`--signal-ink` for text), the primary button `--accent` #FF5B2E, and a one-hue ordinal ramp `--ordinal-1…4`.
- `.night`, the race and the answer at any theme: the same names take their night values, so a component written with `--ink` or `--signal` reads on either surface.
- **Dark**, the page theme under the reader's system setting (owner decision 2, switched on October 18, 2026): no toggle and nothing stored. The dark values sit twice in `tokens.css`, under `[data-theme="dark"]` and under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`, and every component rule written for the attribute has its twin under the media query (`verify-css` rule 9 checks both). Night bands step to `#07090C`; a night card on the dark page takes a hairline ring from `--night-edge`. The viewport `themeColor` is a light and dark pair (`app/layout.tsx`). Share images and OG cards keep their own night palette.

Data colours: the diverging pace ramp (`PACE_RAMP` in `lib/viz/format.ts`, blue to rose to crimson, every warm stop at OKLab ΔE ≥ 15 from every signal, `verify-css` rule 8) and the six pacing-type colours with their night set (`lib/viz/palette.ts`, `typeStyle()`).

## Components

- **Shell:** `SiteHeader` (56 px, 64 px from 900 px; Menu opens `MenuSheet`, from 1180 px the five links and a Chapters drawer), `ReadingBar.client.tsx` (minutes left and a tick per beat), `ChapterRail` from 1180 px, `SiteFooter` (brand line, one row of links, the Motion switch).
- **Chapters:** `lib/chapters.ts` registers eleven chapters in three parts with their pages, readings and "How we know" anchors (`scripts/verify-chapters.cjs`). `ChapterCrumbs` (`components/ui/ChapterHeader.tsx`) is the one chapter line on every page in the race: the marker badge, "Chapter 06 · The finish line" (a chapter after the finish shows its number once, on the badge: "[08] Where you run"), and from 600 px the place ("Page 1 of 2", or a course page's "Courses"), its "·" drawn by CSS so no wrapped line opens on it. `ChapterList.tsx` draws the chapters on their dashed course line in the menu, the home guide and the contents.
- **Readings and answers:** `Reading`, `BigNumber`, `Receipt` and the analysis `AnswerCard`, the tool result card (`.tool-reading`), `Values` (every chart's table twin, closed by default).
- **Charts** (`components/viz/`, server-drawn SVG coloured from tokens): `ChartFrame`, `Readout`, `Axis`, `Annotation` and the forms `LineProfile`, `Histogram`, `DotStrip`, `DotGrid`, `Waffle`, `ShareBar`, `Ruler`, `Dumbbell`, `Cdf`, `Scatter`, `Waterfall`, `YearStrip`, `ElevationPace` and `TypeGlyph`. `Scrubber.client.tsx` is the one touch control (a needle or a pick, 1:1 with the thumb, detents at the values the headline names, the readout above the plot). The replay is `ReplayPoster` at build and `ReplayStage.client.tsx` loading the canvas (`RaceReplay.tsx`) near the viewport.
- **Controls:** `Segmented.client.tsx`, `Chips.client.tsx`, `GuessFirst.client.tsx` (at most one per page), `Scrolly.client.tsx` (at most one per story), `MakeItYours.client.tsx` on `Sheet.client.tsx` (the analysis explorer's filters), `components/tools/EvidenceTag.tsx` (the only file that draws evidence badges).
- **Units:** `components/ui/ByUnits.client.tsx` shows the server-drawn miles or kilometres version of a sentence, receipt or chart; `UnitsProvider` holds the switch. Miles are the default.
- **Moved addresses:** `components/MovedPage.tsx` with `LegacyAnalysisLink.tsx` (`/packs`, `/research/personalized`, `/your-race`, `/htw` and the two weather slugs; [SEO](SEO.md)).

## Motion and accessibility

Only transform and opacity animate, and only where motion explains (the replay, a scrub, the reveal of an answer); durations scale with `--motion`, which is 0 under reduced motion and the footer's Motion switch. Every interactive element is at least 44 × 44 px (the layout linter, `scripts/design/lint-layout.cjs`), focus is a 2 px `--focus` ring, every chart has a label that states its finding and a Values table, and grey text holds 4.5:1 and marks 3:1 in both themes.

## Copy and numbers

Every figure and directional word comes from a field through `lib/nuggets/` with a guard and a neutral fallback (`scripts/verify-nuggets.cjs` recounts each one independently; no placeholders remain). Insights only on pages; methods, sources and limits live on `/methodology`, and "sustained slowdown" links to `/methodology#sustained-slowdown`. Shares are "of finishes", never "your chance"; the site never says "arithmetic". Number ranges never break at their dash (`joinRanges` in `components/ui/keepTogether.tsx`).

## Checks

`node scripts/verify-css.cjs` (tokens, breakpoints, chart text, quiet edges, compatibility, the pace ramp and dark parity), `scripts/design/shoot.cjs` (captures at phone, desktop, dark by system setting, reduced motion, km and 200% zoom), `scripts/design/lint-layout.cjs`, `scripts/design/interactions.cjs` and `scripts/design/sheet.py` (contact sheets, strips and diffs). The `/design-system` gallery was deleted at integration (owner decision 14).
