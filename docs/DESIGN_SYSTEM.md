# Design system: race-day paper

The site's look is "race-day paper": warm paper pages, a few night sections for the moments that should feel like a race morning, and charts drawn by hand in SVG or Canvas. Tokens live in `app/globals.css` and story components in `app/story.css`.

## Type

| Role | Family | Use |
| --- | --- | --- |
| Display | Fraunces Variable (`--serif`) | Page and chapter titles, with an italic orange emphasis (`<em>`) |
| Body | Inter Variable (`--sans`) | Prose, controls, chart labels |
| Labels | JetBrains Mono Variable (`--mono`) | Eyebrows, kickers, axis ticks, small data labels |
| Numerals | Bricolage Grotesque Variable (`--bib`) | "Bib" numbers, nugget figures, stat tiles |

The fonts are self-hosted through `@fontsource-variable/*`, imported in `app/layout.tsx`. Verifier-loaded components must not import CSS or fonts.

- **Fallbacks.** Each stack names a metric-matched fallback right after its web font (the `@font-face` rules at the top of `app/globals.css`): a system font scaled to the width of the site's copy in the web font (`size-adjust`) and given the web font's ascent, descent and line gap, so text keeps its line breaks when the web font swaps in. Fraunces falls back to Times New Roman Bold (titles at 680 and headings at 600–640 matched separately, italics on their own, all at their display optical sizes), Inter to Arial and Arial Bold, JetBrains Mono to Courier New, Bricolage Grotesque's figures to Arial Bold; Android, which has none of these, gets Noto Serif and Roboto. Card titles set at optical size 72 or below are wider in Fraunces than the display match, so they can gain a line when it arrives. The home title steps down to 2.65rem at 339 px and narrower, where its three lines fill the column in Fraunces and would need four in the fallback.
- After changing a font package, a weight or a title's variation settings, rebuild and run `node scripts/font-fallbacks.cjs` (it needs the Liberation fonts, which share Times New Roman, Arial and Courier New's metrics) and paste its rules; `--check` compares them with `app/globals.css`.

## Colour

| Token | Hex | Meaning |
| --- | --- | --- |
| paper | `#F5F0E6` | Page background |
| ink | `#15171C` | Text |
| night | `#0E1116` | Night sections and dark cards |
| orange | `#FF5B2E` | Primary accent; "slower" in diverging scales |
| blue | `#2F5BFF` | "Faster" in diverging scales; cool temperatures |
| gold | `#F4B23E` | Night accents, clock readouts, fan bands |
| green | `#17A673` | Good or gained; route start |
| rose | `#E2416B` | Losses; the 2020 gap |
| violet / teal | `#7A4DFF` / `#0FA3A3` | Recorded women / recorded men |

- **Diverging pace ramp** (faster → slower): `#1D3FD8 #4F79F7 #9DB6FB #EFE8DA #FFB48A #FF6A3D #C8202F` (`paceColour` in `lib/viz/format.ts`).
- **Temperature ramp**: cool blue → paper → hot red (`tempColour` in `components/story/WeatherStory.tsx`).
- **Pacing-type colours**: `lib/viz/palette.ts`.

## Components

- **Site header** (`components/SiteHeader.tsx`, styles in `app/globals.css`): the brand, `SiteNav` and the units switch. The brand and the Menu button's label and icon are written in the root layout and handed to `SiteHeader` as props, so their markup is not in every page's JavaScript. At 720 px and below it is one 57 px row (brand, a Menu button styled like the units switch, the units as MI / KM) and the links open as a two-column panel of the same pills below it, and while it is open the row is solid paper, like the panel; the credit line is left out there. On phones it slides up while the reader scrolls down and returns on any scroll up (transform only, so nothing shifts); it stays while its menu is open or it holds keyboard focus, and never moves under reduced motion or the site's pause switch. The links' order is Plan your race, Stories, Tools, Find a runner, Courses, About, then Request an analysis (orange) at every width.
- **Story shell** (`components/story/StoryShell.tsx`):
  - `StoryHeader`: night hero with a runner lane.
  - `StorySection`: kicker, title, dek, body.
  - `StoryMethods`: method, caveats, downloads.
  - `StoryNav`: previous and next story.
- **Cards**:
  - `.viz-card` (with `.dark`), holding `.viz-head` (title, subtitle, controls), `.viz` (a measured SVG via `useWidth`) and `.viz-note` (interpretation and limits).
  - `.bib` cards for headline numbers.
  - `.nugget` for one large figure with a sentence.
- **Controls**:
  - `.segmented` button groups with `aria-pressed`; they scroll horizontally on phones.
  - `.ghost-select` labelled selects.
  - Range inputs inside `.heat-slider`.
- **Illustration**:
  - `components/art/Runner.tsx`: a jointed runner, driven by Catmull–Rom gait keyframes in `lib/art/gait.ts`, with an `effort` parameter.
  - `RunnerLane`.
  - `useTicker` / `useInView` / `usePrefersReducedMotion`: animation runs only while visible and stops under reduced motion or the site-wide pause.
  - `useTicker(active, fps, limit)`: decorative loops (runner lanes, the magnet runner, the gap gauge, the heat runner) pass `limit = 30` so they settle after 30 s on screen.
  - `components/story/CourseArt.tsx`: supplied routes with an `animateMotion` runner that runs the course once and stops at the finish, and elevation profiles.
- **Replay**: `components/viz/RaceReplay.tsx`, a Canvas field with Gaussian lanes, straight and route views, and a HUD. While its rows load (`status`), it draws its frame at full size with the message where the field will be, so the page below does not move when they arrive.
- **Tools** (`app/tools/tools.css`, `components/tools`):
  - `ToolHeader` (icon, title, dek, evidence badges), `ToolMethod` (method, limits, sources) and `ToolNext` (related tools), all server components.
  - `.tool-workspace`: inputs (`.tool-inputs`) beside results (`.tool-results`) on desktop, stacked on phones. A headline result (`.tool-headline` with `Stat`) comes first, then detail.
  - `EvidencePanel`: a panel of Pace Notes data, published research or official standards names its evidence kind with a coloured `.evidence-badge`; panels of plain calculations from the visitor's inputs carry no badge. The site never uses the word "arithmetic".
  - Inputs: `DurationField` keeps the visitor's text while typing and accepts `3:30:00`, `3:30`, `3h30`, `210` and keypad dots. `Choice` is a `.segmented` group; `Stepper` nudges a value by a minute.
  - `ShareBar` (copy link, print) and `.print-only` / `.no-print` for printable pace charts and wristbands.
  - `ToolHandoffs` (`.tool-handoffs`): next-step cards under a headline result, in the "More tools" card style with the target's accent on the left edge, two up where they fit and stacked on phones. `MarathonHandoffs` fills them for a marathon time (the pace band and the pacing-pattern analysis). The runner search's no-match result uses the same cards (`.runner-nomatch-next`).
- **Feedback** (`components/PageFeedback.tsx`, styles in `app/story.css`): one quiet row, "Was this useful?" with Yes and No as small pill buttons, a mono uppercase label and a hairline above; after No a second row offers four fixed reasons, then a one-line thank-you. The chosen button is filled ink. It has no text box. It sits at the end of stories (before the pagination), tools (before More tools) and analyses (before the related tool, aligned with the analysis column on desktop).
- **Experiments** (`components/Experiment.tsx`): wrap each version of the markup a test changes in `<Variant experiment="<key>" show="<variant>">` (`as="span"` inside a paragraph). The wrapper is `display: contents`, so it adds no box and the layout is the same as without it; give every variant the same structure and classes where you can.
  - Each tool's card and icon use its registry accent (`--tool`).
- **Home page ways in** (`app/(home)/page.tsx`, styles in `app/story.css`; October 15, 2026):
  - The marathon-time box (`.hero-goal`, `components/story/HeroGoal.tsx`, the `make-it-yours` version of experiment `home-hero-v1`): a gold mono label, a pill field on `--night-2` with a 3:1 edge (55% `--night-ink-2` on `--night`; gold focus ring, rose when the time cannot be used), a hint that turns into the message, and a `.button-accent`. It reads times with the tools' parser and uses the whole minute at or below, as the tools hand a time on (3:45:40 is 3:45); leaving the field tidies the time to that h:mm. The hint names the dot ("4:15 or 4.15") because a phone's number keypad has no colon. Digits alone, which the tools read as minutes, are shown as the time they read as on the first press ("415" is 6:55, with the h:mm they may have meant) and used on the second. At 400 px and narrower the button text steps down to .875rem so it stays on one line from 360 px.
  - Ways in (`.hero-doors`): a list of rows with hairlines in `--night-3`, a serif title, a short line in `--night-ink-2` and an orange arrow that moves 3 px on hover. Beside the box on desktop, under it on phones, so the first one is on a 390×664 first screen. At 380 px and narrower the title column narrows so each row stays on one line from 360 px.
  - On the night band, `.chapter-more` (the quieter "Start the story ↓") is `--night-ink` and turns gold on hover. Every `.chapter-more` has a 44 px tap target (`::before`) around its 31 px line, so the underline does not move.
  - A home chapter ends with `.chapter-links`: its `.chapter-more` story link and, quieter, `.chapter-try` ("Try it with your race", a mono kicker over an ink-2 link with a hairline underline) to the tool or analysis that asks the chapter's question of the visitor's race.

## Rules

- **Units.** Miles are the default. Any distance, pace, elevation or temperature in client copy goes through `useUnits` (`Distance`, `Pace`, `Section`, `Temperature`, `TemperatureStep`, `PerDegree` in `components/story/Units.tsx`). Analysis thresholds stay metric. Recorded sections are labelled by their boundaries, never as invented mile splits.
- **Language.** Say "sustained slowdown", never "the wall". Use association language only. Counts are finishes. Story copy contains no release tags. Tool results from data are observed shares of complete finishes, never "your chance".
- **Tools.** Results appear instantly without a submit button and default to a full example (a 4:00 goal). The results region is `aria-live="polite"`. Inputs live in the URL so links can be shared, except birth dates.
- **Motion.** The footer's `MotionToggle` pauses every animated figure for the whole site, and keeps the phone header in place. It is stored per browser, sets `data-motion-off` on `<html>` and feeds `usePrefersReducedMotion`. Content animations that loop (six runners, the ghost race, the two runners) also have their own `.viz-pause` button. The replay has play and pause controls.
- **Charts.**
  - Every SVG has `role="img"` and an `aria-label` stating the finding. Labels stay static; they do not change every frame.
  - Anything shown only on hover also has a keyboard path: a range input (`.heat-slider`), a select, or arrow keys with a roving `tabIndex` (the same-course pairs grid).
  - Repeated controls on one page get distinct accessible names (for example each replay chart's race picker).
  - Tick density adapts to width; nine-section axes switch to boundary labels on narrow screens (`SectionAxis`).
  - Pace axes tick on a round minutes:seconds grid in the units shown: every 0:30 per mile (0:15 when 0:30 would leave fewer than four ticks, whole minutes for a wide range), every 0:15 or 0:30 per kilometre (`paceTicks` in `lib/pace-ticks.ts`). Never convert a kilometre grid, which reads 8:15, 8:48, 9:21/mi. Distance axes of section charts tick at the recorded section ends.
  - Charts never depend on colour alone when a label fits.
- **Server and client.**
  - Story bodies are server components. Each wraps its section in `<StoryData value={{ … }}>` (`components/story/StoryData.tsx`) so a dataset crosses to the browser once; charts read it with `useStoryData(key, given)`. Passing the same object to several client components makes React serialize it twice, which doubled the story pages.
  - Pages pass only what the browser needs: `clientArchetypes` drops the per-minute barcode and `replayChoices` keeps only the replay picker's fields (`lib/insights-server.ts`).
  - Shared constants used by server components must not live in `'use client'` modules (see `lib/viz/palette.ts`).
