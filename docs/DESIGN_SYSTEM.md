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
  - `useTicker` / `useInView` / `usePrefersReducedMotion`: animation runs only while visible and stops under reduced motion.
  - `components/story/CourseArt.tsx`: supplied routes with an `animateMotion` runner, and elevation profiles.
- **Replay**: `components/viz/RaceReplay.tsx`, a Canvas field with Gaussian lanes, straight and route views, and a HUD.

## Rules

- **Units.** Miles are the default. Any distance, pace, elevation or temperature in client copy goes through `useUnits` (`Distance`, `Pace`, `Section`, `Temperature`, `TemperatureStep`, `PerDegree` in `components/story/Units.tsx`). Analysis thresholds stay metric. Recorded sections are labelled by their boundaries, never as invented mile splits.
- **Language.** Say "sustained slowdown", never "the wall". Use association language only. Counts are finishes. Story copy contains no release tags.
- **Charts.**
  - Every SVG has `role="img"` and an `aria-label` stating the finding.
  - Tick density adapts to width; nine-section axes switch to boundary labels on narrow screens (`SectionAxis`).
  - Charts never depend on colour alone when a label fits.
- **Server and client.**
  - Story bodies are server components that pass only the needed data to client charts.
  - Shared constants used by server components must not live in `'use client'` modules (see `lib/viz/palette.ts`).
