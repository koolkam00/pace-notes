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
- **Charts** (`components/viz/`, server-drawn SVG coloured from tokens): `ChartFrame`, `Readout`, `Axis`, `Annotation` and the forms `LineProfile`, `Histogram`, `Columns`, `DotStrip`, `DotGrid` (with its `.dot-grid-key`: lit and unlit named once), `Waffle`, `ShareBar`, `Ruler`, `Dumbbell`, `Cdf`, `Scatter` (the pair the sentence compares inked and labelled; a point the sentence names outside the pair, such as a course's "Apart from 2022", takes a quiet label, `named`), `Waterfall`, `YearStrip`, `ElevationPace` and `TypeGlyph`. `Scrubber.client.tsx` is the one touch control (a needle or a pick, 1:1 with the thumb, detents at the values the headline names, the readout above the plot, the signal dot where the needle meets the line). Its live line speaks only for a move the focused slider's own value does not announce and empties four seconds later; without JavaScript the needle is a still marker, the crown and the words that say how to slide it (a beat's `how`, `.js-only`) are hidden, and the slider is no focus stop (post-merge review of the half pages, round 5, October 31, 2026). A side value whose measure changes from point to point carries its own words ("67% under 4:00") under one fixed key, never a key that changes with the needle. An interval is keyed with its own glyph (`KeyItem` mark `whisker`), not a line. Labels are placed clear of marks and of the resting needle; below the reference width a label the needle would cross carries the width class that hides it (`lint-layout` checks 11 and 12). The replay is `ReplayPoster` at build and `ReplayStage.client.tsx` loading the canvas (`RaceReplay.tsx`) near the viewport.
- **Controls:** `Segmented.client.tsx`, `Chips.client.tsx`, `GuessFirst.client.tsx` (at most one per page), `Scrolly.client.tsx` (at most one per story), `MakeItYours.client.tsx` on `Sheet.client.tsx`, the tools' `Stepper`, `DurationField` and `GoalBar` (`components/tools/ui.tsx`; on a phone the goal bar floats at the foot of the screen, takes no room in the page, and shows only between the inputs and the closing stack, away while an actions row or an open table is on screen), and `components/tools/EvidenceTag.tsx` (the only file that draws evidence badges).
- **Units:** `components/ui/ByUnits.client.tsx` shows the server-drawn miles or kilometres version of a sentence, receipt or chart; `UnitsProvider` holds the switch. Miles are the default. Since November 11, 2026 a reading the shell repeats (next cards, the chapter rows on `/` and `/research`, the page-list rows on `/stories` and `/analyses`) is drawn by `components/ui/ReadingFigure.tsx`. The next card imports it; `ChapterList` and `PageList` take it as their `Figure` prop from the page, so the menu's compact list in the root layout adds no units island to every page's first-load JavaScript. When its nugget has a kilometre twin (`figureKm`, carried by `readingOf` as `km`; today `pattern.profile` and `weather.start`) it is a `ByUnits` pair, so with KM chosen those rows read "s/km" and "°C" (before, they kept "s/mi" and "°F"). The served HTML keeps the miles figure. `verify-units` renders each twin in both units, and fails if `NextCard` stops using `ReadingFigure`, if `ChapterList` imports a units island or draws a figure itself, or if a page passes readings without `Figure={ReadingFigure}`. The desktop rail's beat label on analysis pages (`components/analysis/Shell.tsx` `data-beat`) still names the miles figure: left, because `RailBeats` would need the units in a component that also renders on pages with an inert switch.
- **Moved addresses:** `components/MovedPage.tsx` with `LegacyAnalysisLink.tsx`: one heading, one plain sentence saying where the page went ("Warming through the race now has its own tab in race-day weather."), one outline button ([SEO](SEO.md#moved-addresses-october-18-2026)).
- **Info pages** (`app/styles/pages/info.css`): an H1, one dek, then short sections divided by hairlines at the reading measure, ending on `InfoNext`. `/privacy`'s short facts (`.info-facts`) also open `/methodology` (its four-fact short version, October 22, 2026), and `/about` opens on its ways in (`.info-ways`: one row per visitor goal over the page that answers it, the `/tools` row's shape). `/about` measures 2.32 phone screens of its 2.5 (October 22, 2026, after the owner's additions to How it is made; 2.22 before them and 1.49 with who and why only).

## Tier and link labels

Added November 14, 2026 with the adoption of `pace-notes-marathon-half-20261113-1113`, on the adoption branch `claude/release-20261113`; it is not on `main` or the live site until that branch merges. In that release every edition (one race in one year) has a verification tier, a split tier and a timing basis, and every link between a runner's results has a confidence. One module says them, so no page writes a badge or its words by hand (lead decision D16).

- **`lib/tiers.ts`** holds the vocabulary: the words, the release's codes they answer to (every tier, split tier, timing-basis text and link confidence the release uses, and the identity file's reasons), the two `/methodology` anchors, and the plain-text helpers. It imports nothing, so a builder's verifier, a card script and a client component can all read it.
- **`components/ui/TierTag.tsx`** is the only file that draws the labels: `TierTag`, `SplitTierTag`, `TimingTag` and `TimingClassTag`, `LinkMark`, `LinkTier` and `LinkLabel`, an edition's labels as one group (`EditionTags`, or `TagGroup` for a page's own set), a list row's text (`TierLine`), and two terms for running copy (`TierTerm`, `LinkTerm`). It has no client script, so it renders in a server page and in a client component alike. It is a module of its own, apart from the evidence badges, so a page carries only the labels it shows.
- **The look** is the last block of `app/styles/components/badge.css`, built from the evidence badge's and the scope chip's rules and tokens: `--ink-2` words, a `--rule-strong` hairline on the pills, no hue, no fill. A tier is not a reading, so nothing is orange. The tokens change with the surface, so the labels read on paper, on `.night` and in the dark theme with no rule of their own.
- **`scripts/verify-tiers.cjs`** holds all of it together (below).

### The words

Sentence case, no number, no hue. These are the only words; a page takes them from the module.

| In the data | Words | Form |
| --- | --- | --- |
| tier `stamped` | Verified | the badge: a tick and the word, drawn as the evidence badge is |
| tier `stamped_weaker_source` | Verified, weaker source | the same badge, always with the two extra words |
| tier `partial` | Partial results | an outlined pill, drawn as the scope chip is |
| tier `unverified` | Unverified | pill |
| tier `held_for_review` | Held for review | pill |
| split tier `finish_time_only` | Finish times only | pill, beside the tier |
| timing class `gun`: a timing basis the release states as gun or gross time, at either distance | Gun times | pill |
| link confidence `medium_variant` and every `low…`; any link whose person the identity file leaves without a runner key | Possible match | pill, with the link's quiet words |
| split tier `splits`; timing classes `chip`, `chip_fallback`, `mixed` and `not_stated`; a result with no link | nothing | the usual case says nothing more |

The tiers `excluded` and `no_rows` belong to editions with no result. They are never shown, and asking the module for their words is an error. So is a code the module does not know, `undefined` (a misspelt field), and a `weaker_source` flag that disagrees with its tier: a build stops; no label is ever a default. Check a data file's codes in its builder's verifier with the same functions (`isShownTier`, `tierWords`, `splitTierWords`, `timingClass`, `linkWords`, `linkQuietWords`), so that a page never meets a bad one at run time.

**Timing.** The release states an edition's timing basis as free text. `timingClass` puts every such text, and the missing value, into one of the classes the linked-records contract uses (`docs/LINKED_RECORDS.md`, "Timing basis"), and a text that is not listed in `TIMING_BASES` is an error. Only `gun` has words: the texts "gun", "gross (gun / Brutto; …)" and "gun (official, …) else chip". A text that falls back to gun time only where a result has no chip time is `chip_fallback`, and "official time" is `not_stated`, because the release does not say whether it is chip or gun time; neither is marked.

**Every link shows its tier** (owner, November 13, 2026: "Show the tier, and don't present low-confidence links as certain"). A link's confidence is printed as quiet words: plain text in the secondary ink, never a pill and never a link. A keyed link (`high_elite`, `high` or `medium`, and the identity file gave the result a runner key) prints its quiet words alone. A link that is not keyed prints the "Possible match" pill and its quiet words.

| Link confidence | Quiet words |
| --- | --- |
| `high_elite` | High, elite |
| `high` | High |
| `medium` | Medium |
| `medium_variant` | Medium, name variant |
| `low` | Low |
| `low_noage` | Low, no age |
| `low_noage_series` | Low, no age, same series |
| `low_nosex` | Low, no recorded sex |
| `low_city_pace` | Low, city and pace |
| `low_carryover` | Low, carried over |

A link of a keyed confidence can still be left without a runner key by one of the identity file's three screens. Its quiet words then say why, after a middle dot: "High · recorded ages differ" (`birth_year_spread`), "recorded sexes differ" (`sex_conflict`), "two results in one edition" (`two_results_in_one_edition`). `LinkLabel` needs that reason for such a link and stops without it.

### Where each goes

- **A label qualifies one edition or one link, where it is named:** an edition's row in a table, a race in a runner's list, a result in a list of possible matches. Tier, split-tier and timing labels link to `/methodology#edition-tiers`, the link mark to `/methodology#link-confidence`. The definitions, the counts by tier, the rule for counted editions, the release's hold notes and the link rule are written there and nowhere else ([AGENTS.md](../AGENTS.md) rule 15): a page shows the label, and the label is the way to them.
- **Two modes.** `link` (the default) is a link to the definition with a 44 px hit area. `link={false}` is a bare label, for a row, a card or a checkbox label that is itself a control: a link holds no link.
- **The badge only on the two verified tiers** (the release's `verified_badge`), and a weaker-source stamp always says so. Pass the release's `weaker_source` flag where the data has it (`<TierTag tier={e.tier} weakerSource={e.weaker_source} />`).
- **"Finish times only" sits beside the tier, "Gun times" beside both.** `EditionTags` draws the three in that order in one wrapping group, from the release's timing-basis text or from a timing class. It carries the list of every timing text, so a client component that holds the timing class composes `TagGroup` with `TierTag`, `SplitTierTag` and `TimingClassTag` instead, and that list stays out of its script.
- **A list row that stands for several editions** (a race in a directory) prints a tier line as plain words with counts: `tierLine({ stamped_weaker_source: 6, held_for_review: 10 })` reads "6 verified, weaker source · 10 held for review", and one tier for all reads "16 verified". Partial editions read "3 with partial results", so the count is plainly one of editions; the pill stays "Partial results". The parts follow the table's order and add up to the editions shown; they are joined as the list rows join their facts (a no-break space, a middle dot, a space). The line is the row's text, not a badge, so it may carry counts and is never a link; the list's key line links the words to their definition once (`TierTerm`).
- **A runner's results:** each linked result shows its link with `LinkLabel` (quiet words, and the pill when it is not keyed). Possible matches are listed apart from the confirmed results, under one line that links to the definition (`LinkTerm`), and enter no figure; a visitor may tick one into their own selection. In a sentence or a count the words come from the module too: `POSSIBLE_MATCHES` (the list's heading), `possibleMatchCount(2)` ("2 possible matches"), `inline(POSSIBLE_MATCH)`.
- **Layout.** Every label is 24 px tall on one line and wraps at its spaces in a narrow column, the tick staying on the first line. A wrapping row of label links needs 22 px between its rows to keep each 44 px hit area clear (`TagGroup` has it); 27 px where a 17 px evidence badge shares the row. In a `.table` give the tier column `className="is-text"`: the other cells do not wrap and align right.

### What never to do

- Never write one of the phrases, in any case, in a string or in JSX text outside `lib/tiers.ts`, and never one of the classes (`tier-badge`, `tier-chip`, `tier-line`, `tier-quiet`, `tier-tags`) outside `TierTag.tsx`. The quiet words of two or more parts and the screens' words are held the same way ("High", "Medium" and "Low" alone are ordinary words). A sentence that needs the words takes them from the module.
- Never give a label a hue, a fill, an icon of its own or a number, and never change its look from a page's sheet. A page sheet may place a label (margin, alignment, order); its colours, edge and type are `badge.css`'s alone.
- Never print "Verified" for a weaker-source stamp, never show an `excluded` or `no_rows` edition, and never fall back to a default for a code or a timing text the module does not know.
- Never put a linked label inside a link, a button or a form label, and never repeat next to a label what it links to (a definition, a hold note, an official count, a coverage figure).
- Never join a possible match into a profile's figures, never present one as certain, and never show a link without its confidence.
- Never use the words for anything else. "Possible match" means the link mark; "Gun times" means an edition whose timing basis is gun or gross time.

### The check

`node scripts/verify-tiers.cjs` fails when the module's words, codes, forms or anchors differ from the tables above; when a tier, split tier, timing-basis text or link confidence in the pinned release's checked-in files (the release contract and the edition directory in its evidence folder, and the marathon cohort manifest) has no words and no class; when the timing classes differ from the linked-records module's (`analysis/linked_common.py`, once the tree holds it; `--linked=<file>` before that) or the identity reasons from `analysis/build_identity.py`; when a function accepts what it should refuse; when a label does not render as a link to its anchor and as a bare label; when the styles drift from the evidence badge's and the scope chip's declarations, use a token those do not (the quiet words alone take `--ink-3`), or stop wrapping; and when any other file under `app/`, `components/` or `lib/` writes a phrase or a label class. The uses that stood before the module are the verifier's `BASELINE`, each listed with its file, counted and printed on every run, and a new use or a stale entry fails. `--list` prints every use it finds, `--self-test` checks the checker against planted mistakes, and `--source=<folders>` recounts the codes from the release's own files (the edition table, `EDITION-TIERS.csv`, the link file and the identity file; it needs Python with DuckDB). It is not part of `npm run verify:data` yet. `scripts/verify-tools.cjs` also fails a tool file that names a label class.

When a release adds, renames or drops a code or states a new timing-basis text, the build stops at the first page or verifier that asks for it. Add the code and its words, or the text and its class, to `lib/tiers.ts` and to the tables in `verify-tiers.cjs` only after the lead or the owner has given the words, then run `--source` on the new release's files. A share card that prints a tier takes the words from the module; add `lib/tiers.ts` to the card stamp's list (`CODE` in `scripts/build-chart-cards.cjs`) in the same change.

## Motion and accessibility

Only transform and opacity animate, and only where motion explains (the replay, a scrub, the reveal of an answer); durations scale with `--motion`, which is 0 under reduced motion and the footer's Motion switch. Every interactive element is at least 44 × 44 px (`scripts/design/lint-layout.cjs`), focus is a 2 px `--focus` ring (`--focus-paper` where a night card's ring is drawn outside it on paper), every chart has a label that states its finding and a table twin, and grey text holds 4.5:1 and marks 3:1 in both themes.

Turning motion off while the race replay plays (the footer switch, or the system's reduced-motion setting changing) pauses it, as the switch promises (`components/viz/RaceReplay.tsx`, November 11, 2026).
Only the change pauses, so Play still plays afterwards.
Left for the owner: the switch still reads on (`aria-checked="true"`) under the system setting; its wording ("off" or "follows system") is the owner's.

## Copy and numbers

Every figure and directional word comes from a field through `lib/nuggets/` with a guard and a neutral fallback (`scripts/verify-nuggets.cjs` recounts each one independently; no placeholders remain). Insights only on pages; methods, sources and limits live on `/methodology`, and "sustained slowdown" links to `/methodology#sustained-slowdown`. Shares are "of finishes", never "your chance"; the site never says "arithmetic". Number ranges never break at their dash (`joinRanges` in `components/ui/keepTogether.tsx`). Every page title ends " | Pace Notes" unless the suffix would take it past 60 characters or the title already names the brand (`verify-seo` `title-brand`).

A failed data load shows the loader's own sentence, or the surface's existing fallback when the error is the browser's (a `TypeError` such as "Failed to fetch", a `SyntaxError`, a `DOMException`) or has no words (November 11, 2026).
The helper is `loadErrorText(error, fallback)` in its own small module, `lib/error-text.ts`.
The analysis explorers use it (fallback "The comparison could not load. Check your connection and try again.", the aggregates loader's own words), as do the all-finisher and fast-start analyses, runner context and search, and the projector, weather match, course chooser, predictor and linked half panel, each with the fallback it already had.
`verify-ten-analyses` tests the helper and fails if a component under `components/` puts a raw `error.message` on screen.
The planner, split check and race report keep their own `errorText`.

## Checks

`node scripts/verify-css.cjs` (tokens, breakpoints, chart text, quiet edges, compatibility, the pace ramp and dark parity; `npm run verify:data` runs it, and `npm run verify:css` adds its self-test and `copy-fonts --check`), `scripts/verify-chapters.cjs` (the chain, the readings, number once and the methods pattern; `--html` after a build checks the export), `scripts/verify-nuggets.cjs` (every reading recounted with its guard), `scripts/design/shoot.cjs`, `scripts/design/lint-layout.cjs`, `scripts/design/interactions.cjs` and `scripts/design/sheet.py` ([visual review](#visual-review), below). The design scripts and `verify-chapters --html` run only locally; [operations](OPERATIONS.md#checks-by-change-type) lists which checks CI runs. The `/design-system` gallery was deleted at integration (the redesign spec's default 14, taken), and the temporary working notes under `docs/redesign-work/` were deleted at release preparation (October 20, 2026); the spec among them is kept in [history](history/redesign-2026-10/DESIGN-SPEC.md).

**Band strengths** (November 10, 2026). A `LineProfile` band's two opacities are the custom properties `--band-wash` (default .1) and `--band-wash-thin` (default .045) in `app/styles/components/chart-frame.css`; a chart may set both, as `.half-after-chart` does in `app/styles/pages/story.css`. From October 30 to November 10, 2026 they were named `--wash` and `--wash-thin`. `--wash` is also a colour alias in `tokens.css`, and an opacity that reads a colour is invalid, so every band outside the half profile drew at opacity 1. `verify-css` rule 11 now fails on a `var(--name, <number>)` whose name `tokens.css` declares as something that is not a number, in `app/styles/**` and in the `var()` strings the components write.

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
- **Every slot a failed guard feeds falls back.** When a nugget's guard fails (`sentenceOf` in `lib/nuggets/core.ts` gives the neutral fallback), nothing on the page may still state the rejected reading: not the H1, the figure and each place it is repeated (chapter rows on `/` and `/research`, next cards, night cards), the dek, a caption, the table row marked as the reading, the chart's signal mark, the share card or the `/methodology` sentence that describes the page. The figure states a reading only under a guard of its own, otherwise a neutral count. Recount each slot in the nugget's recount (`scripts/nuggets/*.cjs`).
- **Name recorded sex wherever a sex filter applies.** With a recorded-sex chip pressed or `sx=` in a shared link, every sentence the filter changes says "recorded women's" or "recorded men's", so a shared link never reads as all marathons.
- The rules every page already keeps are in [copy and numbers](#copy-and-numbers): figures from nuggets, shares "of finishes", no "your chance", no "arithmetic", no release tags in visible copy.

## Touching tokens, fonts or units

The Top 100 and half-marathon share cards are stamped with a hash of everything they are drawn from, including `app/styles/tokens.css`, `app/styles/fonts.css`, `lib/units.ts`, `lib/nuggets/format.ts` and the chart code (`CODE` in `scripts/build-chart-cards.cjs`). A change to any of them makes every card stale, and `npm run verify:data` fails on both `--check` runs. Re-stamp both sets (`node scripts/build-chart-cards.cjs`, then `node scripts/build-chart-cards.cjs --set half`), run each again with `--check`, open the PNGs, and run `npm run og:check` (the Open Graph cards copy the colour tokens; no CI job runs it). [Top 100 charts](TOP_100_CHARTS.md) describes the cards.

## History

The lines the post-merge half review (branch `fix/half-followups`) rewrote are kept word for word, as `main` held them at `f8869591`, in [history](history/half-followups-2026-11.md) (moved November 4, 2026).
