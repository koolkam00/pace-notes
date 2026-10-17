# Pace Notes redesign inventory

Read from `/home/user/wt/insights` (branch `feat/insights-only`, HEAD `ad14520` plus an uncommitted WIP in 9 files: methodology page, `components/methods/*`, `lib/report.ts`, `lib/stories.ts`, `docs/PROJECT_HANDOFF.md`). Its `out/` folder is a dummy-key static export of that tree, built 2026-10-16 21:34 UTC (`out/version.json`). All measurements below come from that export. Nothing in the repository was edited.

The numbers quoted here (counts, shares, KB) describe the current build. They are **not** design constants: release `htw-db-2026-10-16-1652` will change every data figure (34 cities and 287 race-years, against 29 cities and 194 story editions now).

---

## 0. The fifteen facts that matter most

1. **Size.** There are 37 `page.tsx` route files. They export 175 HTML pages, 117 of them in the sitemap. Most of the volume comes from 85 pack pages, 29 course pages, 13 analysis pages, 7 stories and 22 tool pages. A redesign touches about 40 distinct templates.
2. **Charts are mostly hand-rolled SVG**, plus one Canvas field: about 55 exported chart components in `components/story/*`, `components/viz/RaceReplay.tsx` and `components/art/*`, all measured with `useWidth` (a ResizeObserver hook). Recharts 2.12.7 survives only in the legacy analysis and runner views: `QuestionLineChart` (lazy), `WeatherAnalysis` (scatter, static import), `RunnerContext` (static import) and dead `components/charts/Fig1-6`.
3. **Recharts is the biggest bundle cost.** Chunk `6961` (98,979 B gzip, 376 KB raw) sits in the *initial* JS of all 13 `/analyses/*` pages and `/runners`. `WeatherAnalysis.tsx` imports it statically, and because `/analyses/[slug]` is one route, every analysis pays for it. That makes those pages the heaviest on the site: 281,977 B of initial JS against a 146–160 KB baseline.
4. **There is one chunk per dynamic route.** `/stories/[slug]` ships all seven stories' client components to every story (27.7 KB gzip page chunk). `/analyses/[slug]` likewise ships every explorer.
5. **The framework floor is about 146 KB gzip of initial JS on every page:** react-dom 53.6 KB, next runtime 31.8 KB, `polyfills` 31.1 KB (`noModule`, so modern browsers skip it, but S8 counts it) and layout/analytics chunks of about 30 KB. S8 allows **+1,536 B per page** over `scripts/e2e/budget.json`. Today's headroom is only 2.7–2.9 KB on the simple pages, so any new site-wide client component needs a deliberate `--write-budget`.
6. **Fonts are heavy.** Four variable families are self-hosted through `@fontsource-variable`. Fraunces is loaded as `full` (every axis), upright and italic. A Latin first visit downloads about 400 KB of woff2: Fraunces 121 KB + 150 KB italic, Inter 48 KB, Bricolage 41 KB, JetBrains Mono 40 KB. Nothing is preloaded. Metric-matched fallbacks (`scripts/font-fallbacks.cjs`) keep CLS at 0, and any font, weight or title-style change must regenerate them.
7. **There is no OS dark mode.** "Night" is a section identity, not a theme: `.night` bands with `--night #0E1116`, gold accents and night-grain gradients cover heroes, the replay, CTA bands and dark cards. The page body is always paper `#F5F0E6`.
8. **Insights only (owner, 2026-10-16).** Method, source, coverage and caveat copy lives only on `/methodology`. Several verifiers assert its *absence* with regex lists (`METHOD_COPY` and `BANNED`), and `verify-seo methods-anchors` requires every `/methodology#id` link to resolve.
9. **Analytics pins page structure.** `data-track-section` ids must come from `TRACKED_SECTIONS`. The home page must mark exactly `hero, paths, stakes, guide, steps, stories, cta`, in that order (`verify-analytics` and S6). Course pages map their sections to `hero`, `chapter-1…7`, `cta` and `related`. The planner has `result`, `comparison` and `pace-band`, and the report has `report`. `chapter-*` on `/` feeds the autopilot's `home_depth@v1`; changing that is the owner's decision.
10. **Replay masking pins class names.** These classes must survive as whole class tokens in specific files: `.tool-workspace`, `.tool-results`, `.analysis-layout`, `.personalized-guide`, `.which-card`, `.finish-lookup`, `.home-plan`, `.projector-cards`, `.course-chooser-list` and the `ph-no-capture` containers. Story charts must keep `.viz svg` and the replay `.replay`, or rrweb snapshots grow and could capture input-dependent geometry.
11. **The e2e harness pins selectors and copy.** S1, S2, S3 and S6 use ids, labels and button text: `#home-plan-goal`, `.home-plan-button`, `#site-menu a`, `.nav-toggle`, `nav.course-toc`, `#goals tbody th a`, `getByLabel('Time')`, "Update comparison", "Save runner card", "Turn off analytics" and more (section 3.15). Renames must be mirrored in `scripts/e2e`.
12. **Phone first-screen rule (S1).** At 390×664 and 402×714, the home title, the "Plan your race" button and both other doors must end above the fold, and that button must be the only orange control on screen. At 195 and 201 px (200% zoom) nothing may overflow, overlap or be clipped.
13. **Units.** Miles are the default and every distance or pace goes through `useUnits` / `UnitText` / `components/story/Units.tsx`. A page that shows unit-dependent text must be listed in `lib/unit-preference.ts`, otherwise the build throws. Internal links use `UnitLink` and never carry `units=mi` (`verify-seo units-links`).
14. **Hard limits.** Static export only (`output: 'export'`). No third-party host of any kind: fonts, CDNs and images all fail I1 and the autopilot smoke tripwire. No regex lookbehind and no post-Safari-15.4 built-ins (S5, `verify-compat`).
15. **The pages are long and text-heavy on a phone.** At 390 px, `/methodology` is 67.7 screens, `/research/personalized` 17.7, `/tools/qualifying` 15.9, `/courses/berlin` 15.9, `/courses/boston` 14.9, `/stories/courses` 13.6, `/courses` 13.4 (a 29-card list), `/tools/course-chooser` 13.3 and `/stories/race-replay` 12.2. Stories run 6.8–13.6 screens. No page overflows sideways at 390 px.

---

## 1. Routes

### 1.1 How routes are produced

- **Route files:** 37 `app/**/page.tsx`, plus layouts (`app/layout.tsx`, `app/tools/layout.tsx`, `app/report/layout.tsx`, `app/runners/layout.tsx`), `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx` and the metadata routes `app/robots.ts`, `app/sitemap.ts` and `app/manifest.ts`.
- **Route groups:**
  - `app/(home)/page.tsx` is `/` and `app/research/(hub)/page.tsx` is `/research`.
  - Both sit in groups on purpose. In Next 14, a page directly in a parent folder hands its client chunks to every child route. Before the move, `/privacy`, `/htw` and `/runners` loaded the home page's charts (about 37 KB gzip).
  - **Keep the home page and hub in groups.**
- **Dynamic params (`generateStaticParams`):**

  | Route | Params from | Count today |
  | --- | --- | --- |
  | `/analyses/[slug]` | `TEN_ANALYSES` (`lib/ten-analyses.ts`) + `getWeatherAnalyses()` (ready weather candidates in `public/data/weather/evidence.json`) + `downhill-start` | 13 (10 + `warming-and-pacing`, `wind-and-pacing` + downhill) |
  | `/stories/[slug]` | `STORIES` (`lib/stories.ts`) filtered by verified `manifest.files` and the `BODIES` map | 7 |
  | `/courses/[city]` | `coursePages().keys()` (`lib/course-page.ts`, from `getCourseNames()` in `ext_course_pacing_profiles`) | 29 (34 cities in the new release) |
  | `/tools/marathon-pace/[goal]` | `GOAL_PAGE_MINUTES` (`lib/tools/pace-chart.ts`) | 5 (3-00 … 5-00) |
  | `/tools/qualifying/[race]` | `STANDARDS` (`lib/tools/qualifying.ts`) | 6 (boston, nyc, london, chicago, berlin, sydney) |
  | `/packs/[packId]` | `PACK_IDS` ∪ `QUESTIONS` ∪ `getExtensions()` | 84 (+ fixed `/packs/smyth_htw`) |

- **Sitemap:**
  - `lib/seo-routes.ts` `sitemapEntries()` lists 117 URLs: `/` 1, `/about` 1, `/analyses` 14, `/courses` 30, `/finish-times` 1, `/methodology` 1, `/packs` 34 (index + 33 primary), `/privacy` 1, `/research` 2, `/slowdown` 1, `/stories` 8 and `/tools` 23.
  - Search pages register through `lib/seo-pages/{pace,qualifying,finish-times}.ts` into `EXTRA_SITEMAP_PAGES`.
  - `CONTENT_DATES` holds hand-kept `lastmod` dates for text pages. **Bump them for every page whose visible text the redesign changes.**
  - `COURSE_PAGES_WRITTEN` holds the course pages' text date.
- **Noindex:**
  - `NOINDEX` covers `/runners`, `/your-race`, `/request-analysis`, `/htw`, `/packs/smyth_htw` and `/report`.
  - `THIN_PACKS` covers p3, p4, r16, r33, rn1 and rn4.
  - 45 pack aliases point their canonical at a primary pack.
- **Redirects (vercel.json):** `/htw` and `/packs/smyth_htw` go to `/slowdown`, `/tools/marathon-pace` goes to `/tools/marathon-pace-chart`, and the old host goes to `splithappens.run`.

### 1.2 Route table, grouped by section

Columns: **kind** (analysis, story, tool, course, report, runner, research, info), main components, the data read at **build** time (fs, server components) and in the **browser** (through `dataFetch`, SHA-256-checked), the interactive parts, and the phone length (screens of 844 px at 390 px wide) with visible word count.

#### Home and hubs

| Route | Kind | Purpose | Main components | Data (build / browser) | Interactive | Phone length, words |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | hub | StoryBrand home: night hero ("The same 26.2 miles, run 3.4 million ways. Plan yours."), three ways to start, stakes nugget, guide bibs, 3 steps, 3 story cards, night CTA | `HomeDoors` (GET form to `/tools/plan`, `PlanFormUnits`, `KeypadHint`), `HeroReplay` → `RaceReplay` (canvas), `RunnerLane` ×2, `StoryCards`, `CreatorCredit`; `assertCohortTotals()`; JSON-LD `WebSite` | build: `study/evidence.json` (rate, n), personalized `summary.json` (n), insights `manifest.json`, `replay.json`, `course-geometry.json`, `courses.json` (span), `getCourseNames()`. browser: `replay/<slug>.json` (Berlin first) | course select + goal field (keypad colon), Plan button (full GET), replay race picker (`.segmented`), straight/route toggle, play/pause/scrub/speed | 6.8 screens, 486 words |
| `/research` | hub | Every story, the ten analyses, weather questions, the slowdown study and its figures, archive | `StoryCards`, `AnalysisIndex`, `WeatherIndex`, `RunnerLane`; `assertCohortTotals()` | build: manifest, study evidence, `getStudyFigures()`, personalized summary, weather evidence | links only (units switch converts "the first 3.11 mi") | 8.6, 741 |
| `/analyses` | hub | Directory of the ten (priority order) plus weather questions plus a request callout | `AnalysisIndex`, `WeatherIndex`, `RunnerLane` | `TEN_ANALYSES`, weather evidence | links | 4.5, 350 |
| `/stories` | hub | Story grid (numbered cards with accent colours) | `RunnerLane`, `.story-grid` / `.story-card` | manifest (published stories, `analysis_n`) | links | 4.0, 310 |
| `/tools` | hub | Tool cards by group (Plan, Race day, Afterwards, Qualify), evidence badges, pace-chart links | `ToolIcon`, `EvidenceBadge compact`, `RunnerLane` | `TOOLS` registry + manifest (a data tool shows only if its file is verified) | links | 5.3, 405 |
| `/courses` | course hub | 29 course cards: route map, sustained-slowdown share, climb, pacing-type mix bar; JSON-LD `ItemList` | `RouteMap` (SVG, `animate={false}`), `Elevation`, `ARCHETYPE_COLOURS` | `course-geometry.json`, `archetypes.json`, `courses.json`, course names | links | **13.4**, 241 |

#### Analyses (13 pages, one route `/analyses/[slug]`)

All share the `analysis-layout` grid (sticky `analysis-sidebar` listing the ten, plus `analysis-main`), `PageFeedback`, `RelatedTool` (a deep link into a tool), breadcrumb JSON-LD and the pagination `nav.analysis-pagination`. The headline sentence comes from data (`insightHeadline()` in `AnalysisExplorer`, `findingText()` in `lib/analysis-display.ts`), and every chart has an exact-values `<details class="table-disclosure">`.

| Route | Renderer | Data (build / browser) | Interactive | Phone length, words |
| --- | --- | --- | --- | --- |
| `/analyses/pacing-pattern` (rank 1) | `AnalysisExplorer` → `AnalysisChart` → `QuestionViz` (HTML range bars + lazy Recharts line) | build: `getAnalysisStart()` (personalized `summary.json` + city shard, initial All courses / 4:00). browser: `/data/packs/ext_personalized_guide/tables/city_XX.json` | form `.comparison-controls`: Course select, "Finish time to explore" (keypad), `details.profile-refinements` (Age group, Recorded gender, Earlier marathon), "Update comparison" submit; chart picker `<select>` | 2.9, 192 |
| `/analyses/starting-pace` (2) | `FastStartAnalysis` (modes `comparison=all|history`, six opening bands) | `fast-start/all-finishers.json`, `fast-start/evidence.json` (content-hashed, checksum-verified) | mode toggle, course/age/gender/opening selects, apply | 6.2, 519 |
| `/analyses/checkpoint` (3) | `AnalysisExplorer` + `CheckpointExplorer` | `tables/checkpoint_XX.json` on request | mat (20/30/35 km), elapsed time, latest 5 km | 2.6, 183 |
| `/analyses/where-time-is-gained` (4) | `AnalysisExplorer` | city shard | as rank 1 | 3.8, 310 |
| `/analyses/course-comparison` (5) | `AllFinisherAnalysis kind="courses"`, with a history `AnalysisExplorer` | `all-finisher-context/evidence.json` (13 MB folder) | comparison all/history, course/age/gender/early-pace filters | **8.3**, 538 (460 KB HTML) |
| `/analyses/race-day-weather` (6) | `AllFinisherAnalysis kind="weather"` + history explorer + "More weather questions" | same | same | 6.1, 465 |
| `/analyses/hills-and-pacing` (7) | `AnalysisExplorer` (terrain: needs a course) | city shard | course required | 2.3, 155 |
| `/analyses/finish-time-context` (8) | `AnalysisExplorer` + `FinishTimesLink` aside | city shard | as rank 1 | 3.0, 199 (470 KB HTML) |
| `/analyses/finding-improvement` (9) | `AnalysisExplorer` | city shard | as rank 1 | 2.6, 161 |
| `/analyses/age-and-pacing` (10) | `AnalysisExplorer` | city shard | as rank 1 | 3.1, 170 |
| `/analyses/warming-and-pacing`, `/analyses/wind-and-pacing` | `WeatherAnalysis` (Recharts `ScatterChart`, edition browser) | `weather/evidence.json` (must match `analysis/weather-release.json`) | course browser `course=` | 3.2 each, 190 |
| `/analyses/downhill-start` | `AllFinisherAnalysis kind="downhill" archive` | all-finisher evidence | as above | 5.7, 409 |

#### Stories (7 pages, one route `/stories/[slug]`)

Shell: `StoryHeader` (night hero with eyebrow, H1 and dek from `lib/stories.ts` getters, plus a `RunnerLane`), a run of `StorySection`s (`.chapter.story-section`, each with a mono kicker "01 · …", an H2 title with an `<em>` accent, a data-built dek and a `.chapter-body`), then `StoryNav` (`PageFeedback` plus previous/next pagination; the last story ends with "Make it personal"). Data crosses to the client once through `<StoryData>`, so each chart reads `useStoryData(key)`. JSON-LD: `Article` plus `BreadcrumbList`. Every story is read at build time from `public/data/insights/*.json` (verified by `lib/insights-server.ts`). Only the race replay fetches in the browser.

| Route | Data | Sections (id: interactive figure) | Phone length, words |
| --- | --- | --- | --- |
| `/stories/pacing-types` | `archetypes.json` (`clientArchetypes` drops barcodes) | six (`ArchetypeRace` animated, `ArchetypeCards` scroll-snap carousel); barcode (`PacingBarcode`); river (`ArchetypeRiver`); gender; habits (`RepeatHabits`); courses (`CourseTypes`); you (`WhichArchetype` nine-split calculator, `.which-card`, masked) | 9.9, 905 |
| `/stories/round-numbers` | `finish-times.json` | towers (`FinishHistogram`, segmented lenses, tooltip); scoreboard; seconds (`SecondsLens`); rescue (`Rescue`); a `#my-finish` lookup (`.finish-lookup`, masked); links `/finish-times` | 6.8, 577 |
| `/stories/race-replay` | `replay.json` + `course-geometry.json`; browser `replay/<slug>.json` | replay (`HeroReplay`); snapshots; first finish (`FirstFinish`); ghost (`EvenGhost`, race select); emptying (`EmptyingCourse`); packs (`ClockPack`, range); spread (`StretchStrip`) | 12.2, 1,144 |
| `/stories/places` | `positions.json` | gap (`GapGauge`, animated); gains (`GainHistogram`); break-even (`BreakEven`, range input); shuffle (`Ledger`); women (`WomenMen`) | 7.6, 1,945 (most text-dense) |
| `/stories/final-kick` | `kick.json` | magnet (`Magnet`, animated + pause); states (`StateFlow`); break (`BreakRiver`); warning (`WarningLight`, select); bank (`BankAndPay`, range); twins (`TwinRunners`); women-men (`GenderKick`); follows | 11.6, 1,191 |
| `/stories/who-holds-pace` | `demographics.json` | unmask (`GenderDumbbell`); ghost (`GhostRace`, animated + pause); bands; age (`AgeLadder`); field (`WomenShare`) | 9.0, 781 |
| `/stories/courses` | `courses.json` + `course-geometry.json` | fingerprint (`Fingerprints`, `CourseCurve`, `SectionAxis`, `.fp-grid` scroll-snap); name (`NameThatCourse` quiz); weather (`Untangle`, `PairsWaffle` roving-tabindex grid); heat (`HeatCurve`, `.heat-slider`); matched (`MatchedPace`); years (`YearsStrip`, `EraArrows`) | **13.6**, 1,542, 74 SVGs (633 KB HTML) |

#### Courses (29 pages, `/courses/[city]`)

`app/courses/[city]/page.tsx` composes server sections from `components/course/`. It imports `app/tools/tools.css` and `course.css`. Every printed figure is a `<data value data-k>` element through `Fact`. In-page links go through `SectionLink` (`next/link` to `#id`; S1 tests Back). Tables sit in `CourseTable`, a focusable `role="region"` named by its caption.

| Section (anchor) | Tracking id | Component | Data |
| --- | --- | --- | --- |
| Hero (race H1, slowdown share, median, climb, Plan / Pace band / Split links) | `hero` | `CourseHero` + `RouteMap` | `courses.json`, `course-geometry.json`, pace-band scopes |
| At a glance `#at-a-glance` with `nav.course-toc` | `chapter-1` | `CourseGlance` | `courses.json` |
| Finish times by year `#finish-times` | `chapter-2` | `CourseFinishTimes` | `years.cells`, runner-context shards (race dates) |
| Elevation `#elevation` (routes only) | `chapter-3` | `CourseElevation` + `ElevationProfile` | geometry, `tools/course-goal.json`, context shards |
| How finishers paced `#pacing` | `chapter-4` | `CoursePacing` + `CourseFingerprint` + `ResearchQuestion` (pooled profile, lazy Recharts) | `archetypes.json`, `courses.json`, `ext_course_pacing_profiles` |
| Holding pace `#slowdown` | `chapter-5` | `CourseSlowdown` | `courses.json` |
| Goal times `#goals` (3:00–5:00 rows + same-pace dots) | `chapter-6` | `CourseGoals` + `CourseMatched` | `tools/course-goal.json`, `courses.json` `matched` |
| Race-morning weather `#weather` | `chapter-7` | `CourseWeatherByYear` + `CourseWeather` | `courses.json` `weather`, shards |
| Plan your {race} `#plan` | `cta` | `CoursePlan` | tool indexes, all-finisher rows, `QUALIFYING_COURSE` |
| Replay `#replay` (8 courses) | none | `HeroReplay` | `replay.json` (browser `replay/<slug>.json`) |
| `PageFeedback`, then Other courses `#other-courses` | `related` | `CourseOthers` | race months from shards |

Phone length: Boston 14.9 screens (1,409 words), Berlin 15.9 (1,569), Melbourne (no route) 8.4 (688). `lib/course-page.ts` builds every page once per build and stops the build on any context-manifest mismatch.

#### Tools (`/tools/*`, `app/tools/layout.tsx` imports `tools.css`)

Shell: `ToolHeader` (eyebrow, H1 with an accent underline, dek, evidence badges from the registry, breadcrumb JSON-LD), then the tool's client component, then `ToolNext` (`PageFeedback` plus "More tools"). Each tool renders `.tool-workspace` (`.tool-inputs` sticky on desktop plus `.tool-results` with an `aria-live` summary). Inputs live in the URL through `useQueryState` (never birth dates) and show a full 4:00 example by default, with no submit button.

| Route | Component (lines) | Evidence badges | Data (build / browser) | Interactive parts | Phone length, words |
| --- | --- | --- | --- | --- | --- |
| `/tools/plan` | `RacePlan` (503) + `PaceBandStrip`; imports `pace-band.css` | data | build: names/slugs and which tools publish each course; browser: `tools/course-goal.json`, `tools/pace-band.json` + shard | `#plan-course`, `.plan-goal input` (keypad), results `result` / `comparison` (hidden until data) / `pace-band` sections, `ShareBar` (Copy link, "Print wristband strips", "Print this plan"), handoff cards | 6.6, 814 |
| `/tools/pace-calculator` | `PaceCalculator` (296) | none (calculations) | none | Time / Pace / Distance fields (`getByLabel('Time')`, "Pace per mile"), view tabs `.tool-tabs[data-tool-controls]`, pace chart `.pace-chart[data-tool-controls]` faster/slower, split interval, watch overrun | 7.4, 674 |
| `/tools/predictor` | `Predictor` (1,135) | research, data | browser: `tools/projector.json` + `projector/all/20.json` | race time `-t1` + distance, `details.predictor-more` (`-t2`, weekly `-wk`, training pace), Headline, handoffs ("Turn this into a pace band", "See how finishers near this time paced") | 8.4, 843 |
| `/tools/pace-band` | `PaceBand` (818) + `PaceBandStrip` | data | `tools/pace-band.json` + `<course>/<gender>.json`, geometry (build) | "Goal finish time" (inline keypad hint), course, gender `Choice` (ph-no-capture), print strips, sticky `.pace-band-goalbar` on phones | 8.9, 981 |
| `/tools/course-chooser` | `CourseChooser` (568) | data | `tools/course-goal.json` (+ pace-band shards at build) | `#course-chooser-goal`, `#course-chooser-sort`, order, month, `#course-chooser-open`, column sorts; `.course-chooser-list[data-tool-controls].ph-no-capture` with every course | **13.3**, 1,243 (45 SVG) |
| `/tools/weather-match` | `WeatherMatch` (1,128) | data, research | `tools/weather-match.json`, pace-band goals (build) | `#weather-match-temp`, `#weather-match-hum` (dew point), "Marathon goal time", course | 9.0, 834 |
| `/tools/projector` | `Projector` (1,066) | data | `tools/projector.json` + `projector/<scope>/<mat>.json` | mat, `#projector-time`, `#projector-prev`, target, `#projector-start`, "Full result ↓" (`data-not-edit`), saved runner cards `#projector-card-label` + "Save runner card" (`.projector-cards.ph-no-capture`, localStorage) | 7.7, 707 |
| `/tools/split-check` | `SplitCheck` (1,229) | data, research | `tools/pace-band.json` + shards, `archetypes.json`; build: opening groups, type cohort | nine mat boxes `input[id$="-t0..8"]` with one shared keypad hint, `details.split-check-paste` textarea, course, gender (ph-no-capture), "Make a race report" | 9.6, 1,079 |
| `/tools/qualifying` | `QualifyingChecker` (907) + `QualifyingRaceLinks` | official | none (`lib/tools/qualifying.ts` `STANDARDS`, `VERIFIED_AT`) | "Chip (net) time", "Race date", "Date of birth" + "Remember my date of birth on this device" (localStorage), `details.qualifying-more` "Course net drop", Division (ph-no-capture) | **15.9**, 1,656 |
| `/tools/marathon-pace-chart`, `/tools/half-marathon-pace-chart` | `PaceChartTable` (server) | none | `MARATHON_CHART`, `HALF_CHART` | print only | 9.0, 1,691 / 5.5, 563 |
| `/tools/marathon-pace/[goal]` ×5 | `GoalPaceBody`, `GoalPaceDek` (`lib/tools/goal-facts.ts` sentences) | data panels | `tools/pace-band.json`, `pace-band/all/all.json`, `finish-times.json` marks | none (static) | 8.3, about 780 |
| `/tools/qualifying/[race]` ×6 | `QualifyingRace` (282), `QualifyingRaceText` | official | `STANDARDS`, `QUALIFYING_COURSE`, course names | none (static) | 6.1–9.2 |
| `/finish-times` (top level; imports `tools.css`) | `FinishTimeSummary` (server) | data | `finish-times.json`, `courses.json`, manifest | none (static tables) | 4.8, 364 |

#### Runner and report

| Route | Kind | Purpose | Components | Data | Interactive | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `/runners` (noindex, never recorded) | runner | "Analyze a past race": name search → race selection → recorded performances, same-edition peers, weather/route context, race report; or start from splits or a finish time | `RunnerSearch` (`#runner-name`, results, selection bar `.runner-selection` sticky), `RunnerContext` (pacing / similar runners / conditions, Recharts), lazy `RaceReport`, `FinishTimeStart`; layout imports `report.css`, `runners.css` | build: `copyEditions()`, `reportData()`. browser: `/data/runners/manifest.json` + gz name-index and profile shards (402 MB folder), `/data/runner-context/manifest.json` + 256 edition shards | search, checkboxes, "View selected races", tabs, links into tools with `via=runner` | 1.9 screens empty state; 271,722 B initial JS |
| `/report` (noindex, never recorded) | report | One race on one page from `s`, `course`, `g` and `via` in the URL | `ReportView` (`.report-tracked[data-track-section=report]`), `RaceReport` (`.race-report.ph-no-capture`, H3 title), `ReportActions` (`.tool-share.share-bar`: Save image → lazy `lib/report-image.ts` 1080×1350 PNG, Share via `navigator.share`, Copy link, Print) | build: `reportData()` (hashes, opening groups, type cohort). browser: pace-band shard, `archetypes.json` | the four action buttons | 1.5 screens without times |

#### Research archive (research)

| Route | Purpose | Components | Data | Phone length |
| --- | --- | --- | --- | --- |
| `/slowdown` | Sustained-slowdown study: headline count, two research answers, three figures (sensitivity, age, history) | `ResearchQuestion` ×2, `StudyFigure` ×3 → `QuestionViz` | `study/evidence.json` (`lib/research-data.ts`, `lib/study-figures.ts`) | 7.4, 333 words, 5 tables |
| `/packs` | Archive index: 35 questions by theme plus supporting analyses | `QUESTIONS`, `THEMES`, `EXTRA_TITLES` lists | catalogs | 5.4 |
| `/packs/[packId]` ×84 | One research question (or an alias), some reuse `AllFinisherAnalysis` / `FastStartAnalysis` archive variants | `ResearchQuestion`, `AllFinisherAnalysis`, `FastStartAnalysis` | `lib/extension-data.ts` reads `public/data/packs/ext_*` (235 MB) at build | 2.2–8.0; 174,265 B initial JS (the shared route chunk includes the explorers) |
| `/research/personalized` | Archived 12-question personalized guide | `PersonalizedGuide` (`.personalized-guide`, masked) | personalized summary + tables | **17.7**, 1,382 words, 13 tables, 15 details |

#### Info and legacy

| Route | Kind | Purpose / notes |
| --- | --- | --- |
| `/methodology` | info | The only page with methods, definitions, sources, coverage and limits. Contents list (`.methods-contents`) and four parts (`#data`, `#definitions`, `#calculations`, `#limits`), with 30+ stable topic anchors that other pages link to (`/methodology#sustained-slowdown`, `#evidence`, `#tools-<slug>`, `#story-<slug>`, `#course-pages` …). Components: `components/methods/*` (`MethodsData` with `DataCoverage` + `CohortNote`, `MethodsDefinitions`, `MethodsStories`, `MethodsAnalyses`, `MethodsTools`, `MethodsPages`). JSON-LD `Dataset`. The units switch is inert. **67.7 phone screens, 9,920 words, 76 `<details>`, 638 KB HTML.** The WIP is uncommitted. |
| `/about` | info | Who and why, plus links to rank 1 and the request page. 2.4 screens. |
| `/privacy` | info | Analytics and replay description; `COUNTED` map (one entry per event, verified); `AnalyticsPreference` toggle ("Turn off analytics"). 6.3 screens, 938 words. |
| `/request-analysis` (noindex) | info | `AnalysisRequest`, a client-side email composer (`#analysis-question`, `#analysis-details`); mailto/Gmail plus copy fallback. |
| `/your-race` (noindex) | legacy | `LegacyAnalysisLink` forwards old `#guide-*` hashes; server HTML lists the ten. |
| `/htw`, `/packs/smyth_htw` (noindex) | legacy | "Has moved" stub; Vercel 308 sends both to `/slowdown`. |
| `/404` (`app/not-found.tsx`) | info | "This page isn't on the route", with a `Runner` illustration. |
| `app/error.tsx`, `app/global-error.tsx` | info | "This page didn't load properly" plus Reload and Home; the heading takes focus. `global-error` uses inline styles. |
| `robots.txt`, `sitemap.xml`, `manifest.webmanifest` | meta | `dynamic='force-static'`; manifest theme `#F5F0E6`, `display: browser`. |

---

## 2. The design system as it is

### 2.1 Files

| File | Lines | Raw / gzip in build | Loaded on |
| --- | --- | --- | --- |
| `app/globals.css` | 927 | 69.8 KB / 13.6 KB (with fontsource @font-face) | every page (root layout) |
| `app/story.css` | 634 | 59.8 KB / 10.7 KB | every page (root layout) |
| `app/tools/tools.css` | 358 | | `/tools/*` (layout), `/courses/[city]`, `/finish-times` |
| `app/tools/{plan,pace-band,pace-calculator,predictor,projector,split-check,weather-match,course-chooser,qualifying,qualifying/[race]}/*.css` | 7–230 each | | that page only (`plan` also imports `pace-band.css`) |
| `app/courses/[city]/course.css` | 96 | | course pages |
| `app/finish-times/finish-times.css` | 101 | | `/finish-times` |
| `app/report/report.css` | 166 | | `/report` and `/runners` |
| `app/runners/runners.css` | 21 | | `/runners` |
| `docs/DESIGN_SYSTEM.md` | | | the written spec ("race-day paper") |

Rule: components loaded by verifiers through the TypeScript require hook **must not import CSS or fonts**, so CSS imports live only in `app/` pages and layouts.

### 2.2 Tokens (`:root` in `app/globals.css`)

| Group | Tokens |
| --- | --- |
| Paper and ink | `--paper #F5F0E6`, `--paper-2 #EDE6D8`, `--paper-3 #E3D9C6`, `--card #FFFDF8`, `--ink #15171C`, `--ink-2 #3C3F47`, `--ink-3 #66625A`, `--line #DCD3C2`, `--line-2 #C9BFAB` |
| Night | `--night #0E1116`, `--night-2 #171B22`, `--night-3 #252B36`, `--night-ink #F5F0E6`, `--night-ink-2 #B9B3A6` |
| Signals | `--orange #FF5B2E` (primary accent, "slower"; `--orange-ink #B4380D` for text), `--blue #2F5BFF` ("faster", cool; `--blue-ink #2346E6` for links), `--gold #F4B23E` (night accent; `--gold-ink #8A5A00`), `--green #17A673` (`--green-ink #0B7A52`), `--rose #E2416B`, `--violet #7A4DFF` (recorded women), `--teal #0FA3A3` (recorded men) |
| Legacy aliases | `--slate --course --wall --rule --wash --muted --text --accent --panel` (map to the above) |
| Type | `--serif` Fraunces Variable, `--sans` Inter Variable, `--mono` JetBrains Mono Variable, `--bib` Bricolage Grotesque Variable; each followed by its metric-matched `* Fallback` and `* Fallback Android` faces |
| Shape and motion | `--radius 14px`, `--radius-sm 9px`, `--shadow`, `--shadow-lift`, `--ease cubic-bezier(.2,.7,.2,1)`; cards use 20px, CTA bands 28px, pills 999px |
| Data ramps (JS) | `PACE_RAMP` and `paceColour()` in `lib/viz/format.ts` (`#1D3FD8 … #EFE8DA … #C8202F`); `tempColour` in `components/story/WeatherStory.tsx`; `ARCHETYPE_COLOURS` in `lib/viz/palette.ts` (green, blue, gold, violet, rose, orange); `RaceReplay` has its **own hard-coded** `PACE_COLOURS` and rgba canvas colours (canvas cannot read CSS variables) |
| Evidence colours | `.evidence-data` orange-ink, `.evidence-research #5B34D6`, `.evidence-official` green-ink; night variants `#FF9A73`, `#B8A2FF`, `#6FD9AE` |
| Accents per item | `--story` (story accent from `lib/stories.ts`), `--tool` (from the registry), `--door` (home doors) |

- **The OG card generator reads the colour tokens.** `scripts/build-og-images.cjs` checks `--night`, `--night-3`, `--night-ink(-2)`, `--ink`, `--card`, `--orange`, `--gold`, `--blue`, `--green`, `--rose`, `--violet` and `--teal`, and it throws if any of them changes. Changing the palette therefore means updating `TOKENS` there and re-rendering the 63+ OG cards (`npm run og:images`, `og:check`).
- **Theme colour.** The layout's `viewport.themeColor` and `app/manifest.ts` are both `#F5F0E6`.

### 2.3 Type

- **Families:**
  - Fraunces (display; `<em>` italic in orange/orange-ink; titles use `'opsz' 144, 'SOFT' 40–50, 'WONK' 1` at weight 640–680).
  - Inter (body 1.0625rem/1.6, `cv11`, `ss01`).
  - JetBrains Mono (eyebrows, kickers, axes, uppercase .12em tracking).
  - Bricolage Grotesque (bib numbers, nugget figures, 780 weight).
- **Loading:**
  - `app/layout.tsx` imports `@fontsource-variable/fraunces/full.css` and `full-italic.css`, plus `inter/index.css`, `jetbrains-mono/index.css` and `bricolage-grotesque/index.css`, bundled into the global CSS.
  - Every Latin + Latin-ext + Vietnamese + Cyrillic + Greek subset is declared, with `unicode-range` limiting what downloads.
  - There are no `<link rel=preload>` for fonts. `font-display` is fontsource's default `swap`.
- **Fallbacks:** the `@font-face` "Fallback" faces at the top of `globals.css` are generated by `node scripts/font-fallbacks.cjs`. `--check` compares them with the CSS and needs the Liberation fonts. Regenerate them after changing a family, a weight or a title's variation settings.
- **Scale:**
  - `h1 clamp(2.4rem, 6vw, 4.4rem)`, `h2 clamp(1.6rem, 3.4vw, 2.4rem)`, `h3` Inter 1.125rem 650.
  - `.hero-title clamp(2.9rem, 7.6vw, 6.6rem)`, line-height .94. At 720 px and below the home title is 2.25rem, and at 339 px and below `.hero-title` is 2.65rem.
  - `.chapter-title clamp(2.2rem, 5.2vw, 4.1rem)`, `.nugget-number clamp(3.4rem, 9vw, 6.4rem)`, `.bib-number clamp(2.4rem, 5vw, 3.4rem)`.
- **Headings:** `text-wrap: balance`.

### 2.4 Spacing, layout and breakpoints

- **Container:** `.container { width: min(calc(100% - 2rem), 1200px) }`, so phones get a 16px gutter. From 700px it is `100% - 4rem`. `.bleed` breaks full-width out of the container.
- **Chapter rhythm:** `.chapter { padding: clamp(4rem, 9vw, 7.5rem) 0 0 }`, `.chapter-head` max 52rem and `.chapter-dek` max 42rem. `.chapter-grid` is 1.65fr/1fr and drops to one column at 900px.
- **Sticky header offsets:** `scroll-padding-top` is 5.5rem, 8.875rem at 721–980px and 4.5rem at 720px and below. This is measured against header heights of 74, 128 and 57 px.
- **Breakpoint usage** (count of `@media` rules across all CSS):

  | Query | Rules |
  | --- | --- |
  | `max-width: 560px` | 18 |
  | `print` | 16 |
  | `max-width: 640px` | 10 |
  | `max-width: 720px` (the phone header) | 9 |
  | `max-width: 600px` | 8 |
  | `max-width: 760px` | 7 |
  | `min-width: 900px` / `max-width: 900px` | 4 / 4 |
  | `700` / `880` / `960` / `980` / `1100` / `1180` | 2–4 each |
  | `prefers-reduced-motion: reduce` | 3 |
  | `pointer: coarse` (keypad hint) | 1 |
  | small-screen and zoom steps: `max-width: 299`, `339`, `349`, `379`, `380`, `420`, `480`, `520` | the rest |

  No single breakpoint scale exists: 30+ distinct widths are in use.
- **Modern CSS in use:**
  - `color-mix()` (11), `:has()` (6), `@container` (3), `text-wrap` (6), `subgrid` (6), `dvh` with a `vh` fallback (2), `backdrop-filter` (header), `clamp()` (97) and scroll-snap (fingerprint grid, archetype cards).
  - Not used: `@layer`, scroll-driven animations, view transitions, `@starting-style`.
  - `verify-compat` does not scan CSS, so color-mix, `:has` and `subgrid` need graceful fallbacks for Safari 15. The site has no explicit fallback for color-mix (the header background and link underlines).

### 2.5 Layout components

| Piece | File | Notes for the redesign |
| --- | --- | --- |
| Root layout | `app/layout.tsx` | head: `RELOAD_ON_FAILED_FILE` async module script (`lib/chunk-reload.ts`) and `ExperimentHead` (CSS, plus a classic boot script only when an experiment runs). Body: `UnitsProvider` → skip link `#main` → `SiteHeader` → `main#main.container.main-content` → footer → `SiteAnalytics` → `SectionTracker`. Brand and menu icon markup are passed from the server layout as props, so they stay out of every page's JS |
| `SiteHeader` | `components/SiteHeader.tsx` | Sticky, translucent paper with backdrop blur. At 720px and below it is one 57px row (brand + credit, Menu button `.nav-toggle`, `UnitSwitch` as MI/KM). It hides on scroll-down and returns on scroll-up (transform only); it stays visible while the menu is open, while it holds keyboard focus, and under reduced motion. Escape and outside taps close the menu. At 299px and below the controls wrap to a second row |
| `SiteNav` | `components/SiteNav.tsx` | Five links: **Plan your race** (`/tools/plan`, orange `.nav-primary`), Analyze a past race, Courses, Tools, Research. The `.nav-more` line (About, Request an analysis, Open data ↗) shows only in the phone Menu. At 721–980px the nav is a horizontal scroller with edge fades (`data-more-left/right`). `aria-current` drives Research for `/research`, `/stories`, `/analyses`, `/packs` and `/slowdown` |
| `UnitSwitch` / `UnitsProvider` / `UnitLink` / `UnitText` / `MarathonDistance` | `components/UnitsProvider.tsx` | localStorage `marathon-study-units`; `?units=km` wins. On an inert page an `.unit-switch-placeholder` stays in place to keep the layout |
| Footer | in `app/layout.tsx` | checkered top rule (conic-gradient), brand, tagline, `CreatorCredit`, `MotionToggle`, and an 11-link two-column nav |
| `MotionToggle` | `components/MotionToggle.tsx` | site-wide pause; localStorage `pace-notes-motion`; `data-motion-off` on `<html>` |
| Page shells | `StoryHeader` / `StorySection` / `StoryNav` (`components/story/StoryShell.tsx`); `ToolHeader` / `ToolNext` (`components/tools/ToolShell.tsx`); `.directory-heading` (about, privacy, runners, slowdown, request); `.night.story-hero` heroes (stories, research, analyses, courses, tools); `.analysis-layout` (sidebar + main); course `.chapter.course-section` | Heroes nearly always end with a `RunnerLane` |
| Cards and primitives | `.bib` (with `.on-night`), `.nugget` (big number + sentence), `.viz-card` (`.dark`, `.viz-head`, `.viz`, `.viz-note`), `.story-card`, `.tool-card`, `.course-card`, `.research-links`, `.cta-band`, `.note`, `.segmented`, `.ghost-select`, `.heat-slider`, `.evidence-badge`, `.tool-handoffs`, `.button-primary/-accent/-secondary`, `.chapter-more` | |
| `PageFeedback` | `components/PageFeedback.tsx` | "Was this useful?" Yes/No, then four fixed reasons, then thanks. It sits at the end of stories, tools, analyses, course pages and `/report`, and must have no text input |
| `KeypadHint` | `components/KeypadHint.tsx` | "Tap . for :", `aria-hidden`, shown under `@media (pointer: coarse)` |

### 2.6 Charts and visualization code

- **Hand-rolled SVG (no chart library):**
  - `components/story/*Story.tsx`: Archetype, Clock, Courses, CourseInsights, Demographics, FinishTime, Kick, Places, Weather, Years, MoreCharts.
  - `components/story/CourseArt.tsx`: `RouteMap` (an `animateMotion` runner that runs once) and `ElevationProfile`.
  - `components/art/RunnerLane.tsx` and `Runner.tsx` (a jointed runner on Catmull–Rom gait keyframes, `lib/art/gait.ts`).
  - Widths come from `useWidth` (`components/viz/useSize.ts`), initially 720 for SSR.
  - Tooltips use `.viz-tooltip`, a dark ink box. Hover views also have keyboard paths: range inputs, selects, or arrow keys with a roving `tabIndex`.
  - Every SVG has `role="img"` and a static `aria-label` stating the finding.
- **Canvas:** `components/viz/RaceReplay.tsx` (347 lines).
  - It draws Gaussian lanes, a straight view and an on-route view, with a HUD (clock, title, 4 stats), a play button, a scrub range and a speed select.
  - It autostarts once its top passes the bottom fifth of the screen.
  - It draws its full-size frame with a loading message, so nothing shifts.
  - `HeroReplay` wraps it with a race picker and a layout toggle and fetches `replay/<slug>.json` (up to 1,500 sampled finishes, 8 editions).
- **HTML/CSS charts:** the `QuestionViz` `kind:'bars'` range charts (`.range-chart`, `.range-row`, `.range-span`, `.range-marker`, `.range-zero`), plus an exact-values table in each chart.
- **Recharts 2.12.7:**
  - `components/QuestionLineChart.tsx` loads through `next/dynamic` with `ssr:false` after hydration, behind a chunk-failure fallback.
  - It is a static import in `WeatherAnalysis.tsx` (`ScatterChart`) and `RunnerContext.tsx` (line/area).
  - Dead code: `components/charts/Fig1-6`.
  - Pace axes tick on round m:ss grids in the units shown (`lib/pace-ticks.ts`), checked by `verify-units`.
- **Dead code, unreferenced by any route:**
  - `components/HTWDashboard.tsx` (pulls in `charts/Fig1-6`, `tables/T1-4`, `FiltersBar`, `FigureCard`, `TableCard`, `hooks/useLiveData`, `context/FiltersContext.tsx`).
  - `components/PacingPreview.tsx`, `components/PackClientPage.tsx` (+ `hooks/usePackMeta.ts`) and `components/QuestionsHome.tsx`.
  - No verifier references them. They can go, but `verify-compat` still scans them.

### 2.7 Animation and scroll code

- **Animation hooks** (`components/art/useTicker.ts`):
  - `useTicker(active, fps, limit)` drives requestAnimationFrame; decorative loops pass `limit = 30` so they settle after 30 s.
  - `useInView` uses an IntersectionObserver with a 120 px root margin.
  - `usePrefersReducedMotion` combines the OS preference with the site pause.
- **Pausing:** `.viz-pause` buttons sit on looping figures (six runners, ghost race, the two runners, magnet) and `MotionToggle` is in the footer.
- **Unused reveal styles:** `.reveal` / `.is-visible` scroll-reveal CSS exists in `story.css`, but **no component uses it**. There is no scroll-driven storytelling (no sticky scrollytelling, no step triggers).
- **CSS keyframes:** only `shimmer` (loading skeleton) and `draw-route`.
- **Header:** the phone header hides on scroll (transform), as described above.
- **Carousels:** horizontal scroll-snap on `.fp-grid` and `.archetype-grid` at 640/560px and below.

---

## 3. Hard constraints the redesign must keep, or consciously update

### 3.1 Initial-JS budgets (S8, I10)

- **The rule** (`scripts/e2e/budget.json`, `scripts/e2e/scenarios/s8-budget.cjs`):
  - The budget is the gzip (level 9) of every `<script src>` the exported HTML names, measured on a dummy-key build.
  - Each page may exceed its figure by at most `TOLERANCE = 1536` bytes.
  - Lazily loaded analytics chunks (SDK, recorder, web-vitals, replay policy) are excluded.
  - Every `app/**/page.tsx` route needs a measurable page.
  - A route without a figure is held to the largest figure in its first path segment, plus 1.5 KB.
- **To change the budget:** run `node scripts/verify-replay-e2e.cjs --only=S8 --write-budget` and commit it with the reason in `note`/`measured`. `--self-test` is part of `npm run verify:autopilot`.
- **Current headroom** (budget + 1,536 − measured, this build): `/analyses/pacing-pattern` 8,453 B, `/runners` 5,987, `/stories/pacing-types` 6,267, `/courses/boston` 4,511, `/tools/plan` 4,634, `/` 2,945, `/tools` 2,836, `/finish-times` 2,688, `/tools/qualifying/boston` 2,687, `/privacy` 2,838, `/htw` 2,836. **About 2.7 KB of gzip headroom on every simple page**, so the root layout cannot gain about 3 KB of client code without a new budget.

### 3.2 Layout shift and loading

- **S8 lab CLS:**
  - Pages: `/`, `/tools/plan` and `/courses/boston`.
  - Conditions: 390×844 mobile, CPU 4x, a 3 s wait, then a scroll to the bottom.
  - CLS must be ≤ **0.1**. LCP is noted only.
  - `/report` is to be added.
- **Autopilot smoke** (`scripts/autopilot-smoke.cjs`):
  - Every sitemap page at 390×844 (`/` and `/tools` also at 1366×900).
  - Each page needs a visible `<h1>`, no pageerror, no "Application error", no error-page heading and no site request ≥ 400.
  - **Any third-party host fails the run.**
  - Home CLS median above 0.25 (3 runs, 4x CPU, 1.6 Mbps) fails.
  - It runs the quick list again as old Safari.
- **Existing anti-CLS patterns to keep:**
  - Fixed-size replay frame while loading.
  - Metric-matched font fallbacks.
  - Transform-only header hide.
  - `useWidth` initial width.
  - `.chart-placeholder` for the lazy chart.
  - Home title steps at 339px.
  - Hero copy measured to keep line breaks (`docs/DESIGN_SYSTEM.md` "Phone fit").

### 3.3 Analytics contracts (`lib/analytics-policy.ts`, `lib/analytics.ts`, `components/SiteAnalytics.tsx`, `components/SectionTracker.tsx`, `npm run verify:analytics`)

- **Events** (`AnalyticsEvents`): `runner_search_submitted`, `runner_search_completed`, `runner_profile_opened`, `race_comparison_opened`, `analysis_filters_applied`, `data_download_clicked`, `units_changed`, `tool_used`, `page_feedback`, `page_feedback_reason`, `site_error`, `section_viewed`, `report_exported`.
  - Every event must be described in `/privacy` `COUNTED` and in the `docs/ANALYTICS.md` event table (verified).
- **Section ids:**
  - `TRACKED_SECTIONS`: `hero`, `chapter-1…8`, `stories`, `tools`, `analyses`, `cta`, `faq`, `related`, `result`, `comparison`, `pace-band`, `report`, `paths`, `stakes`, `guide`, `steps`.
  - `data-track-section` must be a **literal** from that list in `app/` or `components/`.
  - A new id means changing `lib/analytics-policy.ts`, which is a protected file for the autopilot, plus `scripts/e2e/allowed-properties.json` and the docs.
- **Home order** is asserted in `verify-analytics` (line ~682) and S6 `HOME_SECTIONS`: `hero, paths, stakes, guide, steps, stories, cta`, with no `chapter-*` on `/`.
  - `paths` sits inside `HomeDoors`, read in place of `<HomeDoors`.
  - `autopilot/metrics.md` `home_depth@v1` and the "≥ 3 home chapters" answer signal count `chapter-*` on `/`. Reintroducing chapters changes those metrics, and only the owner may add `@v2` definitions.
- **Course pages:** `hero`, `chapter-1` (glance) … `chapter-7` (weather), `cta` (plan), `related` (other courses). These are pinned by `verify-courses --html` (`TRACK` map, `SECTIONS` order: `at-a-glance, finish-times, elevation, pacing, slowdown, goals, weather, plan, replay, other-courses`).
- **Planner:** `result`, `comparison` (hidden until data) and `pace-band`, mounted from first render. `verify-tools` asserts the exact markup `<div data-track-section="…" hidden="">`.
- **Report:** `<div className="report-tracked" data-track-section="report" hidden={!times}>` (regex in `verify-analytics`). In the runner view it is `<div data-track-section="report"><Suspense`.
- **Tool edits:** `TOOL_CONTROLS = '.tool-workspace, [data-tool-controls]'`, `NOT_EDITS = '.share-bar, [data-not-edit]'` (regex-pinned in `SiteAnalytics`).
  - `data-tool-controls` is pinned on `PaceCalculator`'s `<div className="tool-tabs no-print"`, its `<section className="tool-panel panel-plain pace-chart"` and the course chooser's list opening tag.
  - Every tool button that prints, scrolls or jumps needs `data-not-edit`.
- **Paths:**
  - `STORY_SLUGS` and `COURSE_SLUGS` are **literal lists** (checked against `lib/stories.ts` and `getCourseNames()`), so new courses from the new release must be added there.
  - `searchPages` lists the search pages.
  - Any new section or page must keep its own path or its section's, never `/other` (verify-analytics walks the sitemap).
- **Data fetching:** only `dataFetch` (`lib/data-fetch.ts`). Any other `fetch(` in `app/`, `components/`, `lib/`, `hooks/` or `context/` fails the check.
- **Hidden inputs:** only the home form's units field (`components/home/PlanFormUnits.tsx`), and it must sit inside `.home-plan`.
- **Feedback and trackers:** `PageFeedback` has no text box. `SiteAnalytics` and `SectionTracker` never read values, ids or text.

### 3.4 Session replay masking and blocking (`lib/replay-policy.ts`)

- **Masked text regions:** `.tool-workspace`, `.analysis-layout`, `.personalized-guide`, `.which-card`, `.finish-lookup`, `.home-plan`, plus every `[role=status]`, `[role=alert]` and `[aria-live]`.
- **Left out entirely** (`REPLAY_BLOCKED_ELEMENTS`): `.tool-results`, the svg/canvas inside masked regions, `.viz svg`, `.replay`, `#recharts_measurement_span` and `.projector-cards`.
- **Pinned per file** (`verify-analytics` `required`):
  - `tool-workspace` and `tool-results` in each registered tool's component.
  - `analysis-layout` in `AnalysisExplorer`, `AllFinisherAnalysis`, `FastStartAnalysis` and `WeatherAnalysis`.
  - `personalized-guide` in `PersonalizedGuide`, `which-card` in `ArchetypeStory`, `finish-lookup` in `FinishTimeStory`, and `home-plan` in `HomeDoors` (whose `<form className="home-door home-plan" action=… method="get">` is pinned by regex).
- **Form fields:**
  - Every `<input|select|textarea|DurationField>` in `components/tools` must sit in a tool component that renders `.tool-workspace`.
  - In `components/home`, only `HomeDoors` and `PlanFormUnits` may hold form fields.
- **`ph-no-capture`** must stay on the same element as:
  - `runner-search-form`, `runner-results`, `runner-selection` and the name-bearing elements (`RunnerSearch`);
  - `runner-context`;
  - `race-report` (`RaceReport`);
  - `projector-cards`;
  - `course-chooser-list` and `tool-callout` (`CourseChooser`), and the not-published `EvidencePanel` wrapper;
  - the Division, Recorded gender and gender `Choice` wrappers in `QualifyingChecker`, `SplitCheck` and `PaceBand`.
- **Status regions:** `role="status"/"alert"` and `aria-live` must be literal attributes, never set dynamically.
- **New charts:** a story chart that puts visitor input into SVG must sit inside a masked region. New decorative charts should keep `.viz svg` (or `.replay`) so they stay out of snapshots. The first-snapshot long task was cut from about 610 ms to about 210 ms by blocking them.
- **Blocked pages:** `/runners`, `/your-race`, `/report` and any `via=runner` page are never recorded (`REPLAY_BLOCKED_PAGES`). Links out of `RunnerContext` must carry `runnerHandoffHref`.

### 3.5 SEO (`lib/seo.tsx`, `lib/seo-routes.ts`, `lib/og-paths.ts`, `scripts/verify-seo.cjs`, `verify-courses --html`, `og:check`)

- **Metadata:**
  - Every page gets its metadata from `pageMetadata({ title, description, path, … })`.
  - Each page needs exactly one non-empty `<title>`, meta description and `<h1>` (404 excepted).
  - Titles should be ≤ 60 characters and descriptions ≤ 155 (warnings).
  - Duplicate titles or descriptions among indexable pages fail.
  - Million counts come from `finishesM()`, never typed.
- **JSON-LD:**
  - `WebSite` on `/`, `Article` on stories, `BreadcrumbList` on most, `ItemList` on `/courses` and `Dataset` on `/methodology`.
  - A `Person` must be "Andrew Kam" with no URL, and `/runners` carries no JSON-LD.
- **Checks** (each fails the run):
  - `head-tags`, `robots-meta`, `canonical`, `aliases`, `social-tags`, `og-image` (1200×630, exists), `duplicates`, `sitemap`, `robots-txt`, `json-ld`.
  - `banned-words`: "the wall", "arithmetic" and "your chance(s)", including up to two words in between, anywhere visible or in metadata.
  - `fastest`: not in a title, description, H1 or OG tag.
  - `runner-counts`: no "N runners" or "million runners".
  - `personal-data`, `units-links` (no `units=mi` hrefs), `old-host`, `finish-counts`.
  - `orphans`: every story and analysis must be linked from `/research`, and every other sitemap page from some page.
  - `home-form`: `#home-plan-course` options must equal `#plan-course` on `/tools/plan`.
  - `methods-anchors`: every `/methodology#id` must exist.
- **OG cards:**
  - `public/og/` holds words-only cards rendered by `scripts/build-og-images.cjs` from the registries (story titles and kickers, tool headings, course names).
  - Renaming a title, kicker or tool heading, or changing the palette, means re-rendering the cards. `og:check` flags stale cards and `verify-seo` warns `og-image-fallback`.
- **`verify-courses --html`:**
  - Every printed course figure must be a `<data data-k>` matching its file.
  - One H1 and no empty heading.
  - Each section must be present exactly when its data exists, with its tracking id.
  - No rank words (rank, fastest, toughest, harder, easier, similar, best, worst).
  - Every table must sit in a named focusable region.
  - Goal links must be named "Plan a {goal} {race}".
  - Plus the absence checks for the removed method copy.

### 3.6 Accessibility

What exists today and is partly asserted:

- **Skip link and focus:** skip link `#main`, `:focus-visible` rings (blue; gold on night), and in-page `SectionLink` focus.
- **Tap targets and zoom:** minimum targets of 44–48px on buttons, inputs and selects. 200% zoom must work at 195 and 201 px (S1).
- **Charts:** `role="img"` with a finding `aria-label`. Hover views have keyboard equivalents. Repeated controls get distinct names, and `aria-pressed` is set on segmented buttons.
- **Live regions:** tool results are `aria-live="polite"`, and the error pages focus their heading.
- **Tables:** they sit in focusable `role="region"`s with captions.
- **Motion:** reduced motion plus the site pause; looping figures have their own pause.
- **Colour:** colour is never the only cue when a label fits.
- **Heading order:** pack pages still go h1 → h3 (a known nit).

### 3.7 Units

- **Defaults:** miles are the default and **all analysis thresholds stay metric**. The conversions are exact: 1 mi = 1.609344 km, 1 ft = 0.3048 m.
- **No invented splits:** sections are labelled by their recorded boundaries (for example "0–3.11 mi", "24.85–26.22 mi"). No invented mile splits, halfway readings or extra mats.
- **Pages with the working switch** (`lib/unit-preference.ts`): `UNIT_PAGES = ['/', '/about', '/slowdown', '/htw', '/research', '/your-race']` and `UNIT_SECTIONS = ['/analyses', '/runners', '/report', '/packs', '/courses', '/stories', '/tools', '/finish-times']`.
  - On any other page, `useUnits`, `UnitText` with km prose or `MarathonDistance` throws during the static build.
  - S1 reads every placeholder page in both units, and their text must match.
- **Links:** `UnitLink` adds `units=km` once the preference has been read, and never writes `units=mi`.
- **Weather:** °F differences and mph in miles mode; the retained earlier-result temperature analysis keeps its published °C bands.
- **Verifiers:**
  - `verify-units` covers the conversion table, round pace ticks, "First 3.11 mi" / "8:03/mi" vs "5:00/km" in rendered HTML, the placeholder markup and an old-Safari run.
  - `verify-runner-search` and `verify-runner-context-ui` render in both units.

### 3.8 Evidence badges and tool copy

- **The three badges:** "Pace Notes data", "Published research" and "Official standards" (`EVIDENCE_LABEL` in `lib/tools/registry.ts`). They are drawn only by `components/tools/EvidenceTag.tsx`:
  - a link to `/methodology#evidence`;
  - or a plain `<span class="evidence-badge evidence-…">` inside a card that is itself a link (`compact`).
- **Rules:**
  - Hand-written `evidence-badge` spans fail `verify-tools`.
  - Plain calculations carry no badge.
  - Badges are never combined into one figure.
  - The index shows a data tool only when its file is in the verified manifest.
- **Banned in tools** (`verify-tools` `BANNED`, scanning `components/tools` and `app/tools`):
  - "How this works" boxes (`ToolMethod`);
  - `SLOWDOWN_DEFINITION` and citations or DOIs;
  - "Source:" lines;
  - edition-screening notes;
  - "Fewer than 100 …" and weighting notes;
  - data-limits caveats;
  - "supplied route" or "modelled hour";
  - named method citations (Riegel 1981, Daniels & Gilbert 1979, Vickers …);
  - the projector validation (`AccuracyPanel`).
- **The word "arithmetic"** must not appear under `app/`, `components/` or `lib/`.
- **Hard-coded number:** `EVIDENCE_TEXT.data` in `lib/tools/registry.ts` hard-codes "3.26 million". It shows on `/methodology#evidence` and goes stale with the new release.

### 3.9 Keypad hint and time fields

- **Behaviour:**
  - Race-time fields use `inputMode="decimal"`, and `keypadInput()` (`lib/keypad.ts`) turns the dot or comma key just pressed into a colon on `pointer: coarse` devices.
  - `KeypadHint` renders "Tap . for :", is `aria-hidden` and shows only under `@media (pointer: coarse)`.
  - Pace fields never get the hint or the conversion.
- **S1 pins:**
  - The exact hint text on the home goal.
  - "3.30" becomes "3:30" in `#home-plan-goal`, and the planner opens at "3:30 in Berlin" (`#plan-headline-title`).
  - The pace calculator: `getByLabel('Time')` with "3.30.15" becomes "3:30:15", and `/^Pace per mile/` keeps "8.5", then shows "8:30" when left.
  - The pace field has no hint.
  - At 195 px, `.tool-field-hint .keypad-hint` on the pace band sits on one line.
  - The split check shows one `.split-check-inputs .keypad-hint` for its nine boxes (`fieldset ~ .tool-field-hint .keypad-hint`), and `input[id$="-t2"]`.
  - Desktop: the hint is not shown, and "3.5h" / "3.75 hours" in `.plan-goal input` read 3:30:00 / 3:45:00.
- **`verify-tools`** covers the readers.

### 3.10 Privacy rules

- **Never in URLs, analytics, the sitemap or JSON-LD:** birth dates (`pace-notes-qualifying-birth` is localStorage on request), runner names and search text.
- **Runner search fields** have no `name` attribute, so a form submitted without JavaScript cannot add `?q=` (`verify-runner-search`).
- **Browser storage keys** are allowlisted (I6): `marathon-analytics-disabled`, `marathon-study-units`, `ph_<token>_*`, `pace-notes-runner-handoff`, `pace-notes-exp:<key>`, `pace-notes-chunk-reload`, `pace-notes-qualifying-birth`, `pace-notes-projector-runners`, `pace-notes-projector-start`, `pace-notes-motion`. **Any new localStorage or sessionStorage key fails I6** until it is allowlisted in the harness and the docs.
- **No third-party requests (I1):**
  - It scans every served page and stylesheet for absolute URLs in `src`, `srcset`, `poster`, `<link>`, SVG `href`, CSS `url()` and `@import`.
  - No Google Fonts, no CDN, no remote images.
  - The `<a href>` links to GitHub releases and PostHog's privacy page are allowed.
- **Referrer:** `Referrer-Policy: strict-origin` (meta and header), because tool inputs live in the URL.
- **Copy:** never write "your chance". Shares are observed shares of complete finishes. Counts are finishes, not runners.

### 3.11 Old Safari (S5, `verify-compat`)

- **Source scan:**
  - Bans regex lookbehind `(?<=` and `(?<!` (comments included).
  - Bans `structuredClone`, `.findLast(Index)`, `.toSorted`, `.toReversed`, `.toSpliced`, `.with(`, `Object.groupBy` and `Map.groupBy` in `app`, `components`, `lib`, `hooks` and `context`.
  - Running with `--build` also scans `out/_next/static` (third-party code included) for lookbehind.
- **S5:** opens every sitemap page with lookbehind throwing, lazy images forced and the page scrolled to the end. Any crash, error page, `site_error` or missing page view fails.
- **Not covered:** CSS features (see 2.4) and real iOS devices.

### 3.12 Static export constraints

- **Next config:** `output: 'export'`, `images.unoptimized`, optional `NEXT_PUBLIC_BASE_PATH` for GitHub Pages.
- **Things that do not exist:** no server, no route handlers beyond the three metadata routes, no ISR and no image optimization. `redirects()` and `headers()` live in `vercel.json`.
- **Dynamic routes** need `generateStaticParams`. Data is read at build time with `fs` in server components (`lib/insights-server.ts` re-verifies hashes) or fetched as static JSON in the browser through `dataFetch`, which checks SHA-256 against the manifest.
- **Server and client boundaries:**
  - Shared constants used by server components must not live in `'use client'` modules (hence `lib/viz/palette.ts`).
  - Pass a story dataset through `<StoryData>` once. Passing one object to several client components doubles the RSC payload.
  - Pages pass only what the client needs (`clientArchetypes`, `replayChoices`).
  - Verifier-loaded components cannot import CSS.
  - Keep `(home)` and `(hub)` route groups.
- **Build-time data checks:** a failed check stops the build. Examples: `assertCohortTotals()` on `/` and `/research`, the study vs summary `n` check on `/`, the course context binding, and the experiment registry.

### 3.13 Copy rules (insights only)

- **Allowed outside `/methodology`:** headline findings, insight sentences with their numbers, chart titles, axes, legends and tooltips, functional copy, and short disclaimers ("Not a prediction").
- **Not allowed:** method, source, coverage, cohort, screen or edition notes, citations and DOIs, download links in body copy, and "How to read this" / "Keep in mind" / "How we calculated this".
- **The term:** where a page used to show the definition, "sustained slowdown" now links to `/methodology#sustained-slowdown` (`.term-link`).
- **Absence lists that a rewrite must not trip:**
  - `verify-ten-analyses` `METHOD_COPY` ("How we calculated this", "at least 100", "15-minute band", "Fewer than 100", "middle 80% of complete finishes" …).
  - `verify-fast-start-client` and `verify-all-finisher-context-client` `METHOD_COPY` ("\d eligible finishes", "equal weight", "calculated reference" …).
  - `verify-report` `METHOD_COPY` ("doi:", "Source:", "supplied", "25% slower", "dashed line" …), and the report must not say you, your, percentile, rank or record.
  - `verify-runner-context-ui` `METHOD_COPY`.
  - `verify-research` `methodCopy` ("Full methodology", "Next analysis", "Data needed:" …).
  - `verify-personalized` ("<summary>Methodology</summary>", "15-minute band" …).
  - `verify-tools` `BANNED`.
  - `verify-courses --html` absence checks.
  - `verify-seo` banned words.
- **Brand and language:**
  - "Pace Notes" branding, "by Andrew Kam".
  - "Sustained slowdown", never "the wall".
  - Association language only: no "causes" or "costs" (the goal-page sentence check bans causal verbs).
  - Never show `private-export` or `20260912` in visible copy (fast-start and all-finisher verifiers).
- **Owner decisions still open:** the cohort-note wording, and the all-finisher course headline naming the two extremes.

### 3.14 Data-release fragility: design around fields, not numbers

The new release changes every figure, adds about 5 courses and may change edition lists. These spots are brittle:

- **Story bodies look rows up by literal keys and indexes,** and many end in a non-null `!`, so a new release that renames or drops a label throws at build:
  - `ReplayBody`: `e.city === 'New York'`, `'London'`, `clock_s === 10800`, `target_s === 16200`.
  - `PlacesBody`: `gap_lo_s === 60`, `label === 'Faster second 20 km'`.
  - `KickBody`: `w.after === '25–30'`, `'15–20% slower'`, `'More than 10% faster'`, `lo_min === 225`, `'3:30–4:00'`, `brk[6]`.
  - `YearsStory`: `year === 2020`.
  - `ClockStory`: `clock_s === 18000`.
  - The home page: `e.city === 'Berlin'` replay default.
  - `PacingTypesBody`: archetype indexes `[0]` / `[3]` / `[4]`.
- **Lists to update when the course set changes:**
  - `COURSE_SLUGS` (analytics) is a literal.
  - OG course cards come from the course list.
  - `/courses` card copy, the home and planner course selects (`home-form` check), `QUALIFYING_COURSE`, and the "Washington Marathon" naming decision.
- **Verifiers that pin today's numbers** (expected to be refreshed by the data adoption, not the redesign):
  - `verify-fast-start-client`: "47% developed a sustained slowdown", "16.6 min faster", "17.9%", "142,757", "67,025", and `3517336` / `3,517,336`.
  - `verify-all-finisher-context-client`: 3517336.
  - `verify-weather`: "98.3% uncertainty interval".
- **Fixture-based verifiers** use made-up numbers and are not affected: tools, report, runner search and ten-analyses range charts.
- **Headline grammars pinned by regex** (`verify-ten-analyses`):
  - `sections`: "The two groups split most in the …–… mi section, where finishes just over 4:00 took … min more than those just under."
  - `age`: "Across N age groups, the second 12.43 mi ranged from …"
  - `courses`: "Across N courses, median finishes ranged from … than the same runners' earlier bests." It must name no course.
  - `verify-all-finisher-context-client`: `<h2>(?:Sustained slowdown rates ranged from|The sustained slowdown rate was|Late-race pace|Late-race experiences varied most in)`.
- **Data-built copy to reuse for "nuggets":**
  - `lib/stories.ts` getters (titles and deks such as "Three in four finishes speed up…", via `shareInWords`).
  - `insightHeadline()` and `findingText()` (analyses).
  - `weatherFinding()`, `lib/tools/goal-facts.ts` (goal pages), `lib/course-page.ts` (`courseDescription`, glance sentences), `lib/finish-times-summary.ts`, `components/story/bodies/*` (section titles and deks computed from data).

### 3.15 Every verifier and e2e scenario that asserts DOM, selectors or copy

Gate: CI `site-validation.yml` runs `verify:data`, `verify:analytics`, `verify:compat`, `verify:autopilot`, `build`, `verify:compat --build` and `verify:seo` (which includes `verify-courses --html`). The `privacy-e2e` job runs `verify:replay-e2e` (S1–S8) on a dummy-key build.

| Script | Runs in | What it pins (redesign impact) |
| --- | --- | --- |
| `scripts/verify-analytics.cjs` | `verify:analytics` | `TRACKED_SECTIONS` exact list. Home section order (`app/(home)/page.tsx` + `HomeDoors`). Masked class tokens per file (3.4). `ph-no-capture` placements. `<form className="home-door home-plan" action=… method="get">` regex. Only hidden input is `PlanFormUnits`. Report tracked div regexes. `data-tool-controls` on the pace calculator's `tool-tabs no-print` and `tool-panel panel-plain pace-chart`, and the course chooser list. `data-not-edit` on print and jump buttons. `ShareBar` has `tool-share share-bar`. No direct `fetch(`. `PageFeedback` has no text box. `<ExperimentHead />` in `<head>`. One `<SectionTracker />`. `/privacy` `COUNTED` and the docs table list every event. `STORY_SLUGS` / `COURSE_SLUGS` match the registries. Every sitemap page keeps its own or its section's path |
| `scripts/verify-tools.cjs` | `verify:data` | `RacePlan` render: `.tool-workspace` > `.tool-inputs` > `.tool-results` with an `sr-only aria-live` first child, "Per mile … 9:09 … Per km … 5:41", `.plan-mats-k` times, the three `data-track-section` divs, the share bar's button text ("Copy link", "Print wristband strips", "Print this plan") and link order. `MarathonHandoffs` copy ("Plan this goal", "Pick your course: even pace for…", "Turn this into a pace band", "See how finishers near this time paced"). `CourseChooser` "Plan"/"Plan {goalText}" links. `EvidenceTag` hrefs. `EvidencePanel` rendered badge markup. `BANNED` copy. No "arithmetic". `CohortNote` only in `MethodsData`. `assertCohortTotals()` still on home and `/research`. Keypad readers |
| `scripts/verify-ten-analyses.cjs` | `verify:data` | `QuestionViz` range chart classes (`range-chart`, `range-values`, `range-zero`, `range-zero-label`, `range-span`), "No published values for this selection", heading level; `AnalysisChart` `<select aria-controls>` and empty-state `role="status"`; chart notes not rendered; each analysis HTML contains its dek; `METHOD_COPY` absent; the headline regexes (3.14) |
| `scripts/verify-fast-start-client.cjs` | `verify:data` | Rendered fast-start copy: "developed a sustained slowdown", `<a href="/methodology#sustained-slowdown">sustained slowdowns</a>`, "most often began in the", "Pace was slowest in the", "Opening pace", "No previous race needed", `aria-pressed="true">All eligible finishes`; current numbers; `METHOD_COPY` |
| `scripts/verify-all-finisher-context-client.cjs` | `verify:data` | Headline `<h2>` grammar, the onset link sentence, "Slowdown rate in this edition", "Start-hour temperature", "No previous race needed", "Early-race pace", the all-mode button; renders `app/analyses/[slug]/page.tsx`, `app/methodology/page.tsx` and `app/packs/[packId]/page.tsx` |
| `scripts/verify-units.cjs` | `verify:data` | `QuestionViz` / `StudyFigure` unit text ("8:03/mi", "First 3.11 mi", "0–3.11 mi", "24.85–26.22 mi", "per mile"); the figure links no `data/study/evidence.json`; placeholder markup `<div class="unit-switch unit-switch-placeholder" aria-hidden="true">`; working switch `<div class="unit-switch" role="group" aria-label="Distance and pace units">` |
| `scripts/verify-research.cjs` | `verify:data` | `ResearchQuestion` / `StudyFigure`: `<figure class="study-figure">` count equals charts, no `methodCopy`, no doi/plos/pack_meta/evidence links, no standalone cohort size |
| `scripts/verify-personalized.cjs` | `verify:data` | `PersonalizedGuide` source has no Methodology summary or caveat strings; answers have no NaN |
| `scripts/verify-weather.cjs` | `verify:data` | Renders `WeatherAnalysis`, `WeatherIndex`, `app/about/page.tsx` and the analysis page; the uncertainty-interval wording; no "observed halfway"; About shows no `private-export` / "September 11" |
| `scripts/verify-runner-search.cjs` | `verify:data` | `/runners` has a single H1 "Analyze a past race"; `<a class="runner-start" href="/tools/split-check"><b>Have your splits? Paste them</b>`; `<form class="runner-start runner-start-time">` with no input `name`; the search input has no `name`, and the form has no `action` or `method`; "Recorded times only" copy-edition wording; unit renders |
| `scripts/verify-runner-context-ui.cjs` | `verify:data` | `RunnerContext` renders: times, units, "the same pace as your early pace", `METHOD_COPY` absent, select/option markup |
| `scripts/verify-report.cjs` | `verify:data` | `RaceReport`: `<h3 class="race-report-title">` and no `<h1>`; the badge link `class="race-report-badge is-data|is-research"` → `/methodology#evidence`; the "sustained slowdown" link; the slowdown tile markup `<span>Sustained slowdown</span><strong>Yes|No</strong>…`; units; "not an official placing"; no you/your/rank/percentile/record; `METHOD_COPY` |
| `scripts/verify-finish-times.cjs` | `verify:data` | Reads `app/finish-times/page.tsx` and `components/FinishTimeSummary.tsx`; recounts every number from the records |
| `scripts/verify-courses.cjs` (`--html` in `verify:seo`) | `verify:data` + `verify:seo` | Section order, ids and tracking ids; every figure a `<data data-k>`; classes `course-glance`, `course-totals`, `course-hotcool`, `course-slope`, `course-reason`, `tool-table-wrap`, `tool-table`, `page-feedback`, `night`, `hero-dek`; table regions; link names; banned rank words; 5 °C gate in `aria-label` / `title`; absence of removed method copy |
| `scripts/verify-seo.cjs` | `verify:seo` | 3.5 (`head-tags`, `orphans`, `home-form` ids `#home-plan-course` / `#plan-course`, `methods-anchors`, `banned-words` …) |
| `scripts/verify-insights.cjs` | `verify:data` | Data recount; no names or release tags in story copy fields |
| `scripts/verify-browser-compat.cjs` | `verify:compat` | 3.11 |
| `scripts/build-og-images.cjs --check` | `og:check` | Palette tokens, titles, kickers and headings of the cards |
| `scripts/font-fallbacks.cjs --check` | manual | `@font-face` fallback rules in `globals.css` |
| **S1** `s1-browse.cjs` | e2e | `#site-menu a` (5 main links in order with exact text, then `.nav-more` About / Request an analysis / "Open data ↗" on phones only); exactly one `.nav-primary`; `.site-header .nav-toggle`; `a.story-card` on `/`; `nav.main-nav a[href=…]`; `main a[href^="/analyses/"]` on `/research`; `footer a[href="/privacy"]`. First screen: `#hero-title`, `.home-plan-button`, `.home-door-link` ×2 below the fold limits; only orange control is "Plan your race" (exact `rgb(255, 91, 46)`). 200% zoom overlap/clip check over `.site-header .header-brand`, `.nav-toggle`, `.unit-switch`, `#hero-title`, `.home-hero-dek`, `.home-plan-field label`, `.home-plan select/input`, `.home-plan-button`, `.home-door-link`; menu ≥ 8 links scrollable at 195 px. Home form GET semantics (`#home-plan-course`, `#home-plan-goal`, `units=km` only for km, empty goal omitted). Planner `#plan-headline-title` text "4:00 in Berlin" / "3:30 in Berlin", "Type a goal between" in `.tool-workspace`. Keypad checks (3.9). Units switch on `/research` (`#analyses` text "the first 3.11 mi to … the finish."). `nav.course-toc a[href="#goals"]`, `#goals tbody th a`, `h1` on course and planner pages, Back behaviour |
| **S2** `s2-differential.cjs` | e2e | Per-tool labels and ids: `getByLabel('Time')`, "Goal finish time", `[aria-labelledby="pace-band-gender"] button`, `#plan-course`, `#course-chooser-goal`, `#course-chooser-sort`, `input[id$="-t0..8"]`, `.ph-no-capture[role=group] button`, `.split-check-paste summary`, `textarea[id$="-paste"]`, `details.predictor-more`, `-t1/-t2/-wk`, /Average training pace/, `.tool-handoffs a:has-text("Turn this into a pace band")` / "See how finishers near this time paced", `#weather-match-temp`, `#weather-match-hum`, "Marathon goal time", "Chip (net) time", "Race date", "Date of birth", `details.qualifying-more`, /Course net drop/, "Remember my date of birth on this device", `#projector-time/-prev/-start/-card-label`, /Target finish/, button "Save runner card", "Finish time to explore", `.profile-refinements summary`, "Age group", "Recorded gender", /Earlier marathon/, button /Update comparison/, `.analysis-pagination a`, `details.guide-optional`, /Previous marathon/, /Elapsed time/, /Latest 5 km/, `#home-plan-course/-goal`, `.home-plan-button`, `#my-finish`, `.which-card input`, `#analysis-question/-details`. A/B recordings must not differ outside masked regions (`known-differences.json`). Every registry tool needs a case |
| **S3** `s3-runner-journey.cjs` | e2e | `#runner-name`, `.runner-search-form button[type=submit]`, `.runner-matches li`, `.runner-match`, `.runner-profile`, `#runner-profile .runner-race`, `.runner-eligible/-ineligible`, `.runner-races input[type=checkbox]`, `.runner-selection li small`, `.runner-selection-actions .button-primary`, `.runner-context`, `.runner-analysis`, `.rc-multi`, `.runner-numbers > div:nth-child(3)`, `.rc-report …` (`h3`, `button`, `.race-report-race`, `.race-report-record`, `.race-report-table`, `.race-report-actions button`), `.race-report-foot`; the PNG is 1080×1350 `pace-notes-race-report.png`; links carry `via=runner` |
| **S4** `s4-privacy-signals.cjs` | e2e | Button "Turn off analytics"; text "Analytics is off for this browser."; `getByLabel('Time')` |
| **S5** `s5-old-safari.cjs` | e2e | Every sitemap page; `.tool-workspace [role=…]`; `getByLabel('Time')` |
| **S6** `s6-visit-signals.cjs` | e2e | `HOME_SECTIONS` order; `[data-track-section]`; `.page-feedback` with buttons "Yes", "No", "Hard to follow", "The numbers look wrong"; `.unit-switch button:has-text("Kilometres")`; `.share-bar button:has-text(…)`; `.pace-chart button`; `#course-chooser-sort` / `-open`; button "Full result ↓"; "Print wristband strips"; `#plan-comparison`; `#plan-band .share-bar button:has-text("Print this plan")`; `.tool-handoffs a`; `.runner-nomatch-next a`; `.race-report-table`, `.race-report-actions button`, `.race-report-note`; error states `.tool-state.is-error, .projector-quick-text.is-error, [role=alert], .feedback-error, .guide-error` or text /could not (be )?load\|could not be verified/ on every data page (`/`, `/stories/race-replay`, `/courses/boston`, `/research/personalized`, `/report?s=…`, `/runners`, `/analyses/pacing-pattern` and every data tool) |
| **S7** `s7-unload-beacons.cjs` | e2e | `#projector-card-label`, "Save runner card", `getByLabel('Time')` |
| **S8** `s8-budget.cjs` | e2e | Budgets and lab CLS (3.1, 3.2) |
| `scripts/autopilot-smoke.cjs` | after deploy | A visible h1 on every sitemap page; error-page headings from `app/error.tsx` / `global-error.tsx` ("This page didn't load properly"); third-party tripwire; home CLS |
| `scripts/autopilot-guard.cjs` | autopilot PRs only | Protected paths (analytics, privacy, scripts …). Not a constraint for an owner-driven redesign PR, but the redesign should leave the registries it reads (`lib/experiments.ts` literal) parseable |

---

## 4. Bundle facts

Gzip (level 9) of every `<script src>` named in the exported HTML (the S8 method), measured on this dummy-key build. Run with `/tmp/claude-0/-home-user/c10c350d-a8c7-5189-a9e6-98ed5e071f3a/scratchpad/redesign/scripts/js-sizes.cjs`.

### 4.1 The floor (every page, 146,283 B on `/404`)

| Chunk | gzip | What |
| --- | --- | --- |
| `5c65ab8a-…` | 53,637 | react-dom |
| `6044-…` | 31,779 | Next.js app-router runtime |
| `polyfills-…` | 31,084 | `noModule`: modern browsers do not download it, but S8 counts it |
| `6256-…` | 8,357 | analytics policy (`lib/analytics-policy.ts`), handoff and shared libs |
| `8441-…` | 6,814 | URL and link utilities shared by the router |
| `app/layout-…` | 6,514 | `SiteHeader`, `SiteNav`, `UnitsProvider`, `MotionToggle`, `SiteAnalytics`, `SectionTracker`, `CreatorCredit` |
| `app/not-found`, `app/error`, `app/global-error` | 2,577 + 1,362 + 1,785 | loaded on **every** page |
| `webpack-…`, `main-app-…` | 2,148 + 226 | runtime |

Add to that, on most pages: `9703` (3,084 B, units switch helpers, 47 pages) and `7163` (4,262 B, 114 pages).

### 4.2 Heaviest pages and why

| Page(s) | Initial JS | Why |
| --- | --- | --- |
| All 13 `/analyses/*` | **281,977** (budget 288,894) | **Recharts core `6961` 98,979 B**, statically imported by `WeatherAnalysis.tsx` and shared by the whole `/analyses/[slug]` route. Also the route's page chunk 10,122 B (every explorer), `1384` 10,285 B (analysis layout and explorer), `2854` 7,650 B (personalized catalog), `4378` 5,574 B (`QuestionViz`) and `9703` |
| `/runners` | **271,722** (budget 276,173) | Recharts `6961` + `4927` 6,242 B (line/area), statically imported by `RunnerContext.tsx`; page chunk 17,134 B (search, context, report entry). `RaceReport` itself is lazy |
| All 7 `/stories/*` | 195,360 (budget 200,091) | One page chunk 27,727 B with **every** story's charts (route-wide); `3760` 11,470 B (shared story viz: `viz-card`, axes); `6918` 6,796 B (`RaceReplay`) |
| 29 `/courses/*` | 177,319 (budget 180,294) | `3760` + `6918` (replay on every course page, though only 8 have one) + `4378` (`QuestionViz` for the pooled profile) + page chunk 2,934 B |
| 84 `/packs/*` | 174,265 (budget 179,678 for r10) | One route chunk including the `AllFinisherAnalysis` and `FastStartAnalysis` archive variants for every pack |
| Data tools | 163–173 K | Tool page chunks: split check 20.3 KB, weather match 18.9, qualifying 18.8, predictor 18.0, projector 16.3, pace band 11.3, course chooser 10.5, plan 9.1, pace calculator 7.3 (all gzip) |
| `/` | 157,472 (budget 158,881) | Home page chunk only 1,309 B, plus `6918` replay and `9703`; most of it is the floor |
| Simplest pages (`/about`, `/methodology`, `/packs`, `/privacy`, `/htw`) | 147–149 K | The floor |

### 4.3 Other weight that matters on phones

- **HTML (RSC payload inlined):**

  | Page | Raw | gzip |
  | --- | --- | --- |
  | `/methodology` | 638 KB | 127 KB |
  | `/stories/courses` | 633 KB | 123 KB |
  | `/analyses/finish-time-context` | 470 KB | 85 KB |
  | `/analyses/course-comparison` | 460 KB | 86 KB |
  | `/analyses/race-day-weather` | 446 KB | 84 KB |
  | `/stories/pacing-types` | 318 KB | 50 KB |
  | `/packs/ext_course_response_profiles` | 310 KB | 66 KB |
  | `/courses` | 216 KB | 55 KB |
  | `/stories/race-replay` | 203 KB | 42 KB |
  | `/courses/berlin` | 191 KB | 34 KB |
  | `/` | 75 KB | 19 KB |

  `StoryData` and the server-passed chart rows dominate.
- **CSS:** two global sheets on every page (13.6 + 10.7 KB gzip), plus section sheets of 1–5 KB.
- **Fonts:** about 400 KB of Latin woff2 on a first visit (2.3); Fraunces `full` upright plus italic alone is 271 KB.
- **Lazy, not initial:** the PostHog SDK (about 98 KB gzip) + recorder (65 KB) + replay policy (6 KB, includes web-vitals) load after idle on production; the `QuestionLineChart` Recharts line chunk loads after hydration on pages with line charts; `lib/report-image.ts` loads on Save image or Share; `replay/<slug>.json` loads on mount.

### 4.4 Levers the redesign can pull without changing data

- Replace or lazy-load Recharts in `WeatherAnalysis` and `RunnerContext`: about −99 KB on 14 pages.
- Split `/stories/[slug]` and `/analyses/[slug]` per page with `next/dynamic` for the bodies: each story stops paying for six others.
- Load `RaceReplay` only where a replay renders (course pages without a replay still ship it).
- Subset Fraunces axes (`wght` + `opsz`, or a static set) and drop the italic file where `<em>` can use a synthetic or the same family.
- Cut `/methodology` HTML by moving long `<details>` content out of the RSC payload, or by splitting the page.
- After any change, remeasure with `--write-budget` and keep CLS ≤ 0.1 in the S8 lab.

---

## 5. Method, files and caveats

- **Page metrics:** phone 390×844 (mobile, touch, DPR 2) and desktop 1280×900. Pages were loaded from `out/` through Playwright routing (no network), scrolled to the end, and then measured for `scrollHeight`, words in `main`, H2 / SVG / canvas / control / table / details counts and horizontal overflow.
  - Raw results: `/tmp/claude-0/-home-user/c10c350d-a8c7-5189-a9e6-98ed5e071f3a/scratchpad/redesign/scripts/measure.json`.
  - Script: `/tmp/claude-0/-home-user/c10c350d-a8c7-5189-a9e6-98ed5e071f3a/scratchpad/redesign/scripts/measure.cjs`.
  - No page errors and no sideways overflow were found at 390 px. `/your-race` client-forwards to `/analyses/pacing-pattern`, so its row repeats that page.
- **Initial JS:**
  - Per page: `/tmp/claude-0/-home-user/c10c350d-a8c7-5189-a9e6-98ed5e071f3a/scratchpad/redesign/scripts/js-all.txt` (columns: gzip, raw, script count, HTML bytes, page).
  - Chunk breakdown: `node …/js-sizes.cjs /home/user/wt/insights/out --chunks <page>`.
- **Caveats:**
  - The worktree is mid-integration: `/methodology` and the methods components are uncommitted WIP.
  - `docs/PROJECT_HANDOFF.md` still has `CHECKS_PLACEHOLDER`.
  - The build's numbers reflect the 0934 data, not the new release.
  - `docs/DESIGN_SYSTEM.md`, `docs/WEBSITE_ARCHITECTURE.md`, `docs/ANALYTICS.md` (home sections, masking, S1–S8), `docs/SEO.md` (checks table, course-page sections) and `docs/TOOLS.md` (keypad, badges) are the documents the redesign must update alongside the code.
