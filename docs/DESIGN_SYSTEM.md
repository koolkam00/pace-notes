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
- **Replay**: `components/viz/RaceReplay.tsx`, a Canvas field with Gaussian lanes, straight and route views, and a HUD.
- **Tools** (`app/tools/tools.css`, `components/tools`):
  - `ToolHeader` (icon, title, dek, evidence badges), `ToolMethod` (method, limits, sources) and `ToolNext` (related tools), all server components.
  - `.tool-workspace`: inputs (`.tool-inputs`) beside results (`.tool-results`) on desktop, stacked on phones. A headline result (`.tool-headline` with `Stat`) comes first, then detail.
  - `EvidencePanel`: every result panel's header names its evidence kind with a coloured `.evidence-badge` and text (arithmetic, Pace Notes data, published research, official standards).
  - Inputs: `DurationField` keeps the visitor's text while typing and accepts `3:30:00`, `3:30`, `3h30`, `210` and keypad dots. `Choice` is a `.segmented` group; `Stepper` nudges a value by a minute.
  - `ShareBar` (copy link, print) and `.print-only` / `.no-print` for printable pace charts and wristbands.
  - Each tool's card and icon use its registry accent (`--tool`).

## Rules

- **Units.** Miles are the default. Any distance, pace, elevation or temperature in client copy goes through `useUnits` (`Distance`, `Pace`, `Section`, `Temperature`, `TemperatureStep`, `PerDegree` in `components/story/Units.tsx`). Analysis thresholds stay metric. Recorded sections are labelled by their boundaries, never as invented mile splits.
- **Language.** Say "sustained slowdown", never "the wall". Use association language only. Counts are finishes. Story copy contains no release tags. Tool results from data are observed shares of complete finishes, never "your chance".
- **Tools.** Results appear instantly without a submit button and default to a full example (a 4:00 goal). The results region is `aria-live="polite"`. Inputs live in the URL so links can be shared, except birth dates.
- **Motion.** The footer's `MotionToggle` pauses every animated figure for the whole site. It is stored per browser, sets `data-motion-off` on `<html>` and feeds `usePrefersReducedMotion`. Content animations that loop (six runners, the ghost race, the two runners) also have their own `.viz-pause` button. The replay has play and pause controls.
- **Charts.**
  - Every SVG has `role="img"` and an `aria-label` stating the finding. Labels stay static; they do not change every frame.
  - Anything shown only on hover also has a keyboard path: a range input (`.heat-slider`), a select, or arrow keys with a roving `tabIndex` (the same-course pairs grid).
  - Repeated controls on one page get distinct accessible names (for example each replay chart's race picker).
  - Tick density adapts to width; nine-section axes switch to boundary labels on narrow screens (`SectionAxis`).
  - Charts never depend on colour alone when a label fits.
- **Server and client.**
  - Story bodies are server components. Each wraps its section in `<StoryData value={{ … }}>` (`components/story/StoryData.tsx`) so a dataset crosses to the browser once; charts read it with `useStoryData(key, given)`. Passing the same object to several client components makes React serialize it twice, which doubled the story pages.
  - Pages pass only what the browser needs: `clientArchetypes` drops the per-minute barcode and `replayChoices` keeps only the replay picker's fields (`lib/insights-server.ts`).
  - Shared constants used by server components must not live in `'use client'` modules (see `lib/viz/palette.ts`).
