# Website architecture

## All-finisher context views

`AllFinisherAnalysis` and `lib/all-finisher-context{,-server}.ts` serve the default rank-5 course and rank-6 temperature views, `/analyses/downhill-start`, and the archive mappings in `lib/broader-analysis-catalog.ts`. Their source is `public/data/all-finisher-context/evidence.json`, bound to both exact runner and environmental-context manifests. The static reader verifies the source and calculation hashes; the client verifies artifact bytes, SHA-256 and source before filtering. `comparison=all|history` selects descriptive within-race or retained prior-result outcomes. Course/age/gender/early-pace filters are exact, never widened. The optional legacy forms preserve explicit history mode on submission.

Opening archive variants reuse `FastStartAnalysis` with a slow, steady or fast initial band and retain original archive panels. The personalized guide links to the broader views while identifying its own history-dependent questions. Legacy downhill links now open the new downhill page; return links still need the history guide. See [all-finisher methods](ALL_FINISHER_ANALYSES.md) for metrics, denominators and source validity.

The current refresh adopts the 0934 source across primary analyses, supporting study, weather, runner lookup and peer/environmental context. Calculation and production evidence are recorded separately in [the refresh record](REFRESH_20260912_0934.md). See [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md) and [runner-context contracts](RUNNER_CONTEXT_AND_PEERS.md).

## Runtime and routes

The primary ten are accompanied by any weather candidates that pass the fixed screen in `public/data/weather/evidence.json`. `weather-data.ts` exposes only ready candidates; `WeatherIndex` adds their links to the homepage and directory, and the temperature page links them as well. `WeatherAnalysis` renders an adjusted percentage-point estimate and uncertainty plus a browser for unadjusted edition observations. Browsing does not refit the overall estimate. The full refresh uses `private-export-20260912-0934` for both inputs; the [refresh record](REFRESH_20260912_0934.md) separately records import and deployment. Read [weather methods and decisions](WEATHER_ANALYSES.md) for the current ready/withheld results.

[package.json](../package.json) pins Next.js 14.2.5, React 18.3.1, Recharts 2.12.7 and TypeScript 5.5.4. [next.config.mjs](../next.config.mjs) sets static export, unoptimized images and optional NEXT_PUBLIC_BASE_PATH/assetPrefix. The public host is [Pace Notes](https://splithappens.run). The root [vercel.json](../vercel.json) permanently redirects the original `htw-live-study.vercel.app` address to it, and `/htw` and `/packs/smyth_htw` to `/slowdown`. Canonical links, Open Graph tags, `robots.txt`, `sitemap.xml` and the web manifest come from `lib/seo.tsx`, `lib/seo-routes.ts` and `app/{robots,sitemap,manifest}.ts`; see [SEO](SEO.md) for the route policy.

| Route | Source / renderer | Purpose |
| --- | --- | --- |
| / | app/page.tsx; HeroReplay, story chapters, AnalysisIndex | Race-replay hero, five story chapters, then the ranked ten analyses |
| /stories and /stories/[slug] | app/stories; lib/stories.ts; components/story/bodies | Seven data stories built from `public/data/insights` ([data stories](STORIES.md)) |
| /tools and /tools/[tool] | app/tools; lib/tools/registry.ts; components/tools | Eight runner tools: pace calculator, predictor, pace band, course chooser, weather match, race-day projector, split check, qualifying checker ([runner tools](TOOLS.md)) |
| /tools/marathon-pace-chart and /tools/half-marathon-pace-chart | app/tools/{marathon,half-marathon}-pace-chart; PaceChartTable; lib/tools/pace-chart.ts | Printable pace charts by goal time, calculated at even pace ([runner tools](TOOLS.md#pace-charts-goal-pages-and-qualifying-race-pages)) |
| /tools/marathon-pace/[goal] | app/tools/marathon-pace/[goal]; GoalPace; `GOAL_PAGE_MINUTES` | Five goal pages (3-00, 3-30, 4-00, 4-30, 5-00): even-pace splits beside observed mat times from the pace-band family and finish-time bunching |
| /tools/qualifying/[race] | app/tools/qualifying/[race]; QualifyingRace, QualifyingRaceText; `STANDARDS` in lib/tools/qualifying.ts | One page per race (boston, nyc, london, chicago, berlin, sydney): official standards, rules, entry and even pace per standard |
| /finish-times | app/finish-times; FinishTimeSummary; lib/finish-times-summary.ts | Median finish, minute-by-minute spread, observed shares under round times and percentiles from `finish-times.json` and `courses.json`; checked by `scripts/verify-finish-times.cjs` |
| /analyses | app/analyses/page.tsx; AnalysisIndex | Primary ten-question directory |
| /analyses/[slug] | app/analyses/[slug]/page.tsx; AnalysisExplorer / AnalysisChart | One primary question, supported controls, observed results and methods |
| /about | app/about/page.tsx | Study purpose and interpretation |
| /packs and /packs/[packId] | app/packs; ResearchQuestion / PackClientPage | Broader current-source research and compatibility aliases |
| /slowdown | app/slowdown/page.tsx; sustained-slowdown dashboard | Current-source slowdown prevalence, onset, sensitivity, age and recorded-history figures |
| /htw and /packs/smyth_htw | Legacy route files | On Vercel, `vercel.json` sends both to /slowdown with a 308; the noindex pages remain for GitHub Pages builds |
| /courses and /courses/[city] | app/courses; lib/course-data.ts; course-geometry.json / courses.json | Route-map directory; per-course route, elevation, pacing types, fingerprint, race mornings, profile and replay |
| /your-race | Legacy personalized entry | Client compatibility redirect preserving mapped question hashes and profile query parameters |
| /research/personalized | Archived PersonalizedGuide | All twelve backing questions in the earlier guide layout |
| /runners | app/runners/page.tsx; RunnerSearch / RunnerContext | Search names, confirm races, compare recorded performances and same-edition peers, inspect weather/current-route context |
| /methodology | app/methodology/page.tsx | Definitions, cohorts and limitations |
| /robots.txt, /sitemap.xml, /manifest.webmanifest | app/robots.ts, app/sitemap.ts, app/manifest.ts; lib/seo-routes.ts, lib/seo-pages/ | Crawl rules, the list of indexable pages with data-derived `lastmod`, and the install manifest ([SEO](SEO.md)) |

[lib/ten-analyses.ts](../lib/ten-analyses.ts) is the primary ordering and route registry: pacing pattern, opening pace, checkpoint, section differences, courses, weather, terrain, target context, improvement and age. The [ten-analysis guide](TOP_TEN_ANALYSES.md) maps these pages to data and limitations. The 35-question catalog in `lib/question-catalog.ts` and 33 broad extension packs remain a research archive; the personalized catalog retains 12 backing calculation paths. These are overlapping views, not independent datasets. `/your-race#guide-{id}` maps the primary ten to their new analysis pages; `#guide-downhill` opens `/analyses/downhill-start`; `#guide-return` opens the retained twelve-question guide at `/research/personalized`. The `/packs` archive links to the ten and keeps the twelve-question list collapsed.

## Search, sharing and host rules

The policy and its checks are in [SEO](SEO.md); this is where each piece lives.

- **Route policy.** `lib/seo-routes.ts` holds `SITE_URL`, the noindex list (`/runners`, `/your-race`, `/request-analysis`, `/htw`, `/packs/smyth_htw`), the thin packs, the pack canonicals and the sitemap list. Every page's metadata comes from `pageMetadata()` in `lib/seo.tsx` (title, description, absolute canonical, Open Graph, X card, robots); `app/layout.tsx` only sets defaults and `metadataBase` `https://splithappens.run`. Runner profiles are never indexable.
- **robots.txt** (`app/robots.ts`) allows everything but the two runner-name folders, `/data/runners/index/` and `/data/runners/profiles/`, and names the sitemap.
- **sitemap.xml** (`app/sitemap.ts`, from `sitemapEntries()`) lists the 115 indexable, self-canonical pages (October 8, 2026), with `lastmod` from the data `as_of` dates or `CONTENT_DATES`, never the build date. Search pages register their paths in `lib/seo-pages/` (`pace.ts`, `qualifying.ts`, `finish-times.ts`), collected by `EXTRA_SITEMAP_PAGES`.
- **manifest.webmanifest** (`app/manifest.ts`): name Pace Notes, the paper colour, `display: browser` and the icons in `public/icons/`.
- **Share cards.** `public/og/` holds 1200×630 cards rendered by `scripts/build-og-images.cjs` (words only); `lib/og-paths.ts` picks the most specific one for each page: its own card, then the parent tool's, the section's, or `og/default.png`. On Vercel preview deployments Next.js points `og:image` at the preview host by design (`VERCEL_ENV=preview`); production uses `https://splithappens.run`.
- **[vercel.json](../vercel.json)** (Next.js `redirects()` and `headers()` do not run with `output: 'export'`):

  | Rule | Effect |
  | --- | --- |
  | Host `htw-live-study.vercel.app`, any path | 308 to `https://splithappens.run/<same path>` |
  | `/htw`, `/packs/smyth_htw` | 308 to `/slowdown` |
  | `/tools/marathon-pace` | 308 to `/tools/marathon-pace-chart` |
  | Every path | `Referrer-Policy: strict-origin` (the same policy as the layout's referrer `<meta>` tag) |
  | Every `.txt` path except `/robots.txt` | `X-Robots-Tag: noindex` (the React Server Components payloads) |
  | `/data/*` | `X-Robots-Tag: noindex` (files stay downloadable) |
  | `/runners` with a `q` query | `X-Robots-Tag: noindex, nofollow` |
  | `trailingSlash: false` | `/tools/` goes to `/tools` in one hop |

  The www host's 308 to the apex is a Vercel domain setting, not in the file.
- **Checks.** `npm run verify:seo` reads the build (CI runs it after `npm run build`); `npm run og:check` checks the cards without a browser; `npm run verify:seo:live` checks the production host after each deploy.

## Full-data access and current data paths

Current policy exposes source code, full runner exports, database snapshots and overlays to anonymous readers in ordinary unencrypted formats. Link to public Release assets for large files; rendering aggregate charts is a performance and analytical choice, not an access boundary. There is no requirement to keep runner data outside this checkout. See [dated access verification](PROJECT_HANDOFF.md#public-access-and-operations).

1. **Supporting study:** `public/data/study/evidence.json`, built by `analysis/build_public_explorer.py`, provides current-source slowdown, severity and milestone results. `lib/research-data.ts` and `lib/study-figures.ts` validate the pinned release and render its documented measures. Old `live.json` charts and S/R/RN/P numerical files are not active inputs; `live.json` becomes small current-release compatibility metadata without figures. Compatibility aliases use current extensions or an explicit unavailable state; registry fallback statuses are not evidence of a current calculation.
2. **Extensions:** lib/extension-data.ts discovers ext_* directories at build time, requires ready schema-valid metadata, reads summaries and CSVs, and maps question_id to lib/question-catalog.ts. Newer input_as_of wins, with calculation date as tie-breaker. Invalid ready data fails the build. This is not a request-time connection to the ingestion database.
3. **Personalized:** `lib/personalized-data.ts` loads the summary/method. `lib/analysis-server.ts` builds the initial All courses / 4:00 answer from the matching city shard during static export. `AnalysisExplorer` and `lib/personalized.ts` select among the fixed aggregates; `lib/analysis-aggregates.ts` loads the needed JSON through the client cache. `public/data/packs/ext_personalized_guide` contains `pack_meta.json`, `summary.json`, `tables/city_XX.json` and `tables/checkpoint_XX.json`. The summary maps city names to filenames; never assume numeric shard positions stay stable. Course comparison uses the summary; checkpoint shards load when requested.

4. **Weather screen:** `lib/weather-data.ts` loads `public/data/weather/evidence.json`; the weather catalog maps ready candidate IDs to static routes. The file contains all three results, edition values, fixed screening rules and provenance. `analysis/weather-release.json` is a separate source pin; both the page reader and verifier require it to match the main study pin and weather JSON; shared eligibility and provenance must also agree.

5. **Public runner lookup:** `analysis/build_runner_lookup.py` writes `public/data/runners/manifest.json` plus compressed name-index and profile shards. `/runners` loads the manifest and relevant shards, verifies their digests and release tag, then lets visitors select their recorded races. Candidate linkage is not independent identity verification; same-name records are never silently merged. The manifest covers all raw records, including those excluded from aggregate analysis, and reports unnamed records explicitly.

6. **Runner context:** `analysis/build_runner_context.py` writes `public/data/runner-context/manifest.json` and 256 compressed edition shards. `lib/runner-context.ts` loads the selected editions, validates source/edition identity and compressed transport, and computes exact finish placement plus achieved-time pacing comparisons. `RunnerContext` exposes pacing, similar-runner and conditions views. The context manifest is bound to the exact runner-manifest hash/timestamp, not merely its release tag. The independent publication verifier checks that binding and recounts all peer finish distributions from the runner shards. Loading has three concurrent requests and a three-edition cache; the full context dataset is not needed to open the page.

Course pages use `lib/course-data.ts` and only `ext_course_pacing_profiles` for both names and plots. Sparse or excluded courses do not fall back to old `live.json` rows. The supporting study, broad questions, personalized engine, weather, search and runner context must all match the common release pin before publication.

## Primary explorer and personalized semantics

Rank 2 (`/analyses/starting-pace`) uses `FastStartAnalysis` and `lib/fast-start.ts` with two verified payloads. The default `public/data/fast-start/all-finishers.json` includes every eligible finish and compares first 5 km with same-race 5–20 km pace. The unchanged `public/data/fast-start/evidence.json` supplies the optional earlier-best comparison of first 10 km with strictly earlier marathon pace. Its loader binds both to the exact runner-manifest hash and current release. Initial all-course rows render at build time; filtering loads the selected mode's content-hashed full aggregate with cancellation, retry and checksum verification. Cache identity must distinguish both payloads.

Mode, course, exact-age band, recorded gender and six opening intensities select exact rows, with no automatic broadening. History additionally uses four earlier-best bands. All eligible finishes has no earlier-time or speed filter, and neither mode uses a target or eventual-finish filter. URL `comparison=all|history` is explicit; an explicit All clears prior filtering. Without an explicit mode, legacy `prior=` or `previous=` links infer history, with `previous=` mapped to the corresponding earlier-best band. `goal=` does not affect either mode. Browser history restores the mode with its filters; captions, reference, cohort and data must switch together. Other ranked pages retain the shared personalized controls below. See [fast-start methods](FAST_START_ANALYSIS.md).

The all-finisher primary outcome is actual time after 20 km minus time at the recorded 5–20 km pace, with actual median finish shown separately. The accounting components are first 5 km and after 20 km; they add to whole-race difference because the 5–20 km block sets the reference. History retains earlier-best finish changes and opening-10 km/remaining accounting. These descriptive references do not establish fitness or an avoidable time penalty. The new output is additive; existing history bytes, shared packs, source pins and eligibility remain unchanged.

`lib/analysis-profile.ts` defines the example as All courses, 4:00, all ages, all recorded genders and no previous time. Profile selections travel between the ten pages in URL parameters; browser history restores them. The explorer labels the example and subsequent selections, validates submitted times, and provides visible loading, retry and unavailable-result states. There is no arbitrary city substitution for a sparse cohort. All courses has no terrain profile: the terrain page asks for a course explicitly.

- Ranking is fixed. Profile changes update comparisons and availability without reordering the ten.
- Read the personalized summary and metadata for source and calculation timestamps. `lib/data-source.ts` formats the exact export tag with its UTC source date, so the two September 11 exports cannot be confused. About and the weather index derive counts/readiness from the imported output.
- Timing checks and reviewed release-specific source exclusions are described in accessible method text. Missing age or gender alone does not remove usable timing from All. A page denominator belongs to its actual cohort, not the full raw corpus.
- Thresholds are every whole minute from 90 through 720 (1:30–12:00). Strict finish < target is evaluated exactly, not interpolated. The engine has 43 presets at 15-minute intervals; achieved-time profiles use a 15-minute bucket centered on the nearest preset and describe achieved finishes, not declared goals.
- Accepted targets do not imply that all corresponding chart cells exist. Profile, nearby-finish, age, prior-performance and checkpoint comparisons retain their sample requirements; sparse and extreme selections can remain unavailable. The pack’s `analyses: 12` counts retained engine paths, not primary pages.
- Visible controls match each question. Course comparison varies courses and hides course/time filters. Weather hides time. Age comparison varies age and hides the age filter. Checkpoint comparison hides previous time. Other relevant profile refinements remain available.
- Ages: 18–24, then five-year bands through 85–89. Unknown exact age contributes to All only.
- Previous time selects a 15-minute band of best recorded performances in the two earlier calendar years, not an exact last-race filter. Broader age/gender/prior comparisons are explicitly labeled.
- Checkpoints at 20/30/35 km use two-minute elapsed bands and optional recent pace trend. Historical complete-finisher outcomes are not calibrated individual probabilities.
- Weather and terrain are supported data views, not universal filters. The weather chart compares published start-hour temperature bands. Terrain switches between supplied elevation and pacing charts; demographic/time refinements change the pace cohort, not the elevation measurements.
- Standard chart estimates require 100 observations. Edition/group comparisons and forecast cohorts have additional rules documented in each pack. These reliability rules do not restrict full-data access.

## Display units

The homepage, About page and ten primary analyses default to miles and minutes per mile. The Miles / Kilometres switch updates these pages together, including distance labels, pace values and axes, exact-value tables, checkpoint controls, and explanatory prose. Miles mode also displays elevation in feet; finish durations, percentages, cohort membership and sample sizes do not change. Weather retains its published temperature bands.

Pace axes tick on a round grid in the units shown (0:30 per mile, 0:15 or 0:30 per km; `paceTicks` in `lib/units.ts`), so a miles chart reads 8:30, 9:00, 9:30 rather than a kilometre grid converted.

The URL parameter `units=mi|km` makes a shared comparison explicit. A valid URL selection takes precedence over the saved browser preference; absent either, the default is miles. The browser remembers changes, and navigation among analysis pages retains the selection. Unit changes are presentation state, not a reason to download or recalculate new cohorts.

The new weather pages also display °F differences and mph in miles mode, or °C differences and km/h in kilometres mode. Their percentage-point outcomes stay unchanged. Course browsing is stored as `course=` and survives unit changes/reloads. The retained earlier-result temperature analysis keeps its published °C bands; the new all-finisher temperature labels convert between °C and °F.

All underlying distances and analytical definitions remain in kilometres. Use the exact conversion of 1 mile = 1.609344 km and 1 foot = 0.3048 m before rounding for display. For example, 5:00/km is approximately 8:03/mile. A source 5 km timing section displays as 3.11 miles, and the 20, 30 and 35 km checkpoint choices retain those exact underlying checkpoint keys. The site does not invent timing mats, halfway readings or individual-mile splits. Distinguish elapsed time for a recorded section from per-mile pace; converting units never changes the elapsed time.

The current supporting pages and runner view convert visible measurements together with their charts when the unit switch is offered. Source schemas and methods remain metric. Any retained metric-only guide must explicitly force matching metric prose and figures rather than mixing units. Technical source schemas, historical method quotations and release assets also keep original metric units. They describe the calculation contract and should not be rewritten as if the source measured mile splits. The historical display-only update left source pins and aggregate numbers unchanged; the separate 0934 data refresh recalculates those outputs. See the [September 11 display verification](evidence/2026-09-11/miles-display.md) for local checks and measured browser examples.

## Older browsers and error pages

Added October 14, 2026; not yet deployed.

**Older Safari.** Safari before 16.4 (iOS 15 and iOS 16.0–16.3) cannot parse a regular-expression lookbehind (`(?<=`, `(?<!`): building one throws a `SyntaxError`. The miles conversion in `lib/units.ts` built five of them, and it runs in the root layout, so before this change 79 of the 115 sitemap pages showed Next.js's "Application error" screen on those browsers and sent no analytics (measured in Chromium with the `RegExp` constructor made to throw on lookbehind, as old Safari does). The conversion now matches the character before a number as its first group and writes it back unchanged (`START`); on 4,361 distinct strings from the published data and the source its output is identical to the old one. The sentence splits on `/slowdown` and in the pack descriptions run only at build time, but no longer use lookbehind either.

Guards:
- `npm run verify:compat` (`scripts/verify-browser-compat.cjs`) scans `app/`, `components/`, `lib/`, `hooks/` and `context/` for lookbehind and for built-ins Safari added in 15.4 or later that Next.js 14 does not polyfill: `structuredClone`, `findLast`/`findLastIndex`, `toSorted`/`toReversed`/`toSpliced`/`with`, `Object.groupBy`/`Map.groupBy`. The comment at the top of the script lists what it covers.
- `npm run verify:compat -- --build` scans the built JavaScript in `out/_next/static`, third-party code included, for lookbehind.
- CI runs the source scan before the build and the build scan after it. `verify:analytics` runs the same source scan, because a page that crashes sends no analytics.
- `verify-units` runs its whole conversion table again with the `RegExp` constructor refusing lookbehind, and checks that `lib/units.ts` has no lookbehind literal.
- `npm run verify:replay-e2e` (CI job `privacy-e2e`) opens every sitemap page with old Safari emulated, as in the check below, and fails on a crash, an error page, a page error, a lookbehind built or a served script that holds one (scenario S5 in [analytics](ANALYTICS.md#browser-privacy-checks)).

Not covered: CSS, other syntax (Next.js compiles it down for Safari 12) and real devices. The browser checks emulate old Safari in Chromium; the Playwright WebKit browser is not installed here.

**Error pages.**
- `app/error.tsx` replaces a page that throws while loading or rendering, inside the normal header and footer.
- `app/global-error.tsx` replaces the whole document when the root layout fails. It renders its own `<html>` with inline styles, because the site's stylesheets may be missing.
- Both say "This page didn't load properly", offer "Reload the page" (a full reload) and a link to the home page, and never show the error message.
- Unless the page is reloading by itself, both move focus to their heading (no focus ring: it is not a control), so a screen reader announces it. Both set the tab's title to "This page didn't load properly | Pace Notes", and after a client-side navigation Next.js's route announcer reads that title rather than the failed page's.
- In the RSC payload the root layout's client components share the page's chunk list, so a page chunk that fails to load is usually caught by `global-error.tsx`.
- A chart's own chunk (the Recharts line chart that `QuestionViz` loads after hydration: 50 sitemap pages, every course page, six analyses, 13 packs, `/slowdown` and `/research/personalized`) does not reach these pages. If it fails, the page reloads by itself once as below; after that the chart box says "This chart didn't load", and the page's text and exact-values table stay.
- Reporting (`site_error`, [analytics](ANALYTICS.md)): a page that reloads by itself reports nothing; the page it reloads into reports `chunk_load` once (`reloadedAfterChunkError`: loaded by a reload, with `pace-notes-chunk-reload` less than 30 s old). The error pages and the chart box report the failure when they show without reloading.

**Reloading after a failed chunk.** When the error is a failed chunk load (`ChunkLoadError`, or the browser's message for a failed dynamic import or CSS chunk), `lib/chunk-reload.ts` reloads the page by itself once. It keeps the time of that reload in this tab's sessionStorage (`pace-notes-chunk-reload`, a timestamp and nothing else) and does not reload by itself again within five minutes. Where sessionStorage is unavailable, it does not reload by itself at all. When the failure happens during a client-side navigation, the address has not changed yet, so a reload (automatic or from the button) reopens the page the visitor was leaving, with fresh files.

**A file the page's HTML names.** Webpack does not notice when one of the scripts listed in the page's HTML fails: it reports the failure only after its two-minute chunk timeout, and when the failed file is React or the webpack runtime nothing reports it at all. So the root layout's `<head>` also holds a small script (`RELOAD_ON_FAILED_FILE` in `lib/chunk-reload.ts`). Until the window's load event it listens for a failed `/_next/static/` script or stylesheet named in the HTML (not the scripts webpack adds, which carry `data-webpack`), and it applies the same once-per-five-minutes reload at once. It is an async module script because React places it after the page's stylesheets and scripts, and a plain inline script there waits for the stylesheets. Chromium then also held back the page's scripts: over HTTP/2, with the stylesheets delayed by 3 s, the page's scripts were requested after 3 s instead of at once (measured). If the file fails again after that reload, the page falls back to webpack: about 120 s of static HTML that does not respond, then the error page. A failed React or webpack file instead leaves the static HTML in place for good, readable and with working plain links but nothing interactive, because no error page can render without React. The window is five minutes, not one, so the error page that comes 120 s after such a reload does not reload the page again. A failure that happens before the script runs is missed and falls back to webpack in the same way.

**Checked October 14, 2026** on local static builds in Playwright Chromium, with every request beyond the site aborted:
- Every sitemap page (115) with old Safari emulated: a build of `main` showed "Application error" on 79 pages; this change showed it on none, with no error page, no page error, no lookbehind built and one document load per page. That held at 390×844 and 1366×900, and with and without the emulation.
- Page chunk aborted during a client-side navigation: one automatic reload. A second failure within five minutes showed the error page with its reload button, and no second automatic reload. With sessionStorage blocked, the error page showed and nothing reloaded by itself.
- A script named in the page's HTML aborted on first load (the page chunk, a shared chunk and the React chunk of `/about`, and `main-app` on `/tools`): the page reloaded at once, within 0.2 s. When only the first request failed, the reloaded page worked. When every request failed, the page chunk and the shared chunk reached the error page 120 s after the reload, with no second reload. The React chunk left the static page unhydrated, with no error page and no second reload. Each of these had two document loads in 200 s. With sessionStorage blocked, nothing reloaded and the error page showed at 120 s. Before the head script, the first reload came after 120 s and the error page at 240 s. A stylesheet that failed once caused one reload and then a styled page.
- The chart chunk aborted on `/courses/berlin`: one automatic reload, then the note in the chart box, with the heading and the 570 words of text still there. With sessionStorage blocked, the same note without the reload. Before, the whole page became the error page.
- An error thrown while rendering a page component showed `error.tsx` inside the header and footer. One thrown in a root-layout component showed `global-error.tsx`. Neither reloaded by itself. Both focused their heading and set the tab's title; after a client-side navigation to the failing page the route announcer read "This page didn't load properly | Pace Notes", and navigating on gave the next page its own title.
- `global-error.tsx` with every stylesheet blocked: both buttons 53 px tall at 390 and 1366 px wide. Before, the home link was 74 px, because it relied on the site's `box-sizing`.
- Not tested: real iOS devices and WebKit, so the head script's timing is measured in Chromium only.

## Data to rendering to deployment

The chart calculations produce aggregate artifacts; the current data-access policy also covers full source records. Importers validate and write the designated public folders. Build reads those files and generates static output. The Vercel project deploys the main branch and serves the verified `splithappens.run` custom domain. Check the new commit and production bytes after each merge. During takeover, all 401 checked-in public aggregate files matched the production responses byte for byte, including September 7 extension metadata. This dated evidence predates the September 11 presentation update; it does not establish the deployment state of later changes.

For a new analysis, update its calculation, registry/question mapping, metadata/method, public aggregate output and verification together. Preserve stable IDs and aliases. For UI changes, test mobile widths and null/sparse cohorts; a successful build alone does not resolve the historical mobile audit.

The earlier September 11 presentation update introduced Marathon Pacing Study terminology and the `/slowdown` route while retaining legacy URLs and internal data keys. The numerical definition stays at least 25% slower for at least 5 km after 20 km relative to the 5–20 km baseline, with a neutral [Published slowdown method (2021)](https://doi.org/10.1371/journal.pone.0251513) citation. Presentation edits do not refresh the source vintage, change numeric aggregates or imply a deployment. Original numerical-run hashes and subsequent presentation revisions are recorded separately where metadata text changes.

The subsequent ten-analysis redesign shipped in [PR #32](https://github.com/koolkam00/htw-live-study/pull/32), main commit `3e32bf8`, and was verified live. It changed primary navigation, page composition and profile controls, and recalculated the personalized pack to expand supported targets. In that redesign, calculation provenance changed while September 7 remained the input. The sustained-slowdown definition is unchanged. The display-only unit change did not recalculate aggregates. Later weather and full-data updates have their own publication evidence; consult the current refresh record rather than using the PR #32 deployment as proof of current source freshness.

## Reader-facing data descriptions

About lists the marathon names and exact recorded years from the runner manifest, plus weather and supplied-route coverage from the context manifest. Source labels across all primary and archive pages use plain language, without export identifiers or upload/calculation dates. Keep exact pins, download URLs, checksums and calculation provenance intact. Race years and dates remain visible where they describe a race.

## Visitor analytics

The root layout mounts `SiteAnalytics` for production-only PostHog pageviews, explicit feature events and masked session replays (never on runner-search pages or pages opened from a runner's profile). The `/privacy` route documents collection and provides a browser opt-out. See [analytics configuration, event definitions and verification](ANALYTICS.md). Search terms, runner IDs, personal filter values and URL queries are excluded; analytics does not read or change the public research data.

Added October 14, 2026 (not yet deployed):
- `SiteAnalytics` also counts tool use (`tool_used`), printing, and failures by kind (`site_error`); `SectionTracker`, mounted once beside it, counts the first view of each section marked `data-track-section` (the home page's hero, chapters, story list, tools, analyses and closing call). `PageFeedback` ("Was this useful?", fixed buttons only) sits before `StoryNav`'s pagination, in `ToolNext` and before each analysis page's related tool.
- Every browser request for the site's data goes through `dataFetch` (`lib/data-fetch.ts`), which reports a failed request as `site_error` `data_fetch` and otherwise behaves like `fetch`; `verify-analytics` refuses a direct `fetch(` anywhere else in `app/`, `components/`, `lib/`, `hooks/` or `context/`.
- `ExperimentHead` (`components/Experiment.tsx`) in the root layout's `<head>` holds the experiments CSS and, when an experiment in `lib/experiments.ts` is running, the classic inline script that gives the tab its variant before the first paint (it waits for the stylesheets, and while it does Chromium holds back the page's script downloads; no script, no wait, when nothing runs); `<Variant>` wraps each version's markup. `lib/experiments.ts` is data only (one literal `EXPERIMENTS` array, read by the autopilot guard without running it); the type and the checks are in `lib/experiment-runtime.ts`. No experiment is registered yet. The rules are in [Experiments](ANALYTICS.md#experiments).

## Pace Notes branding and analysis requests

The public brand is **Pace Notes**, credited to Andrew Kam on the home page, About and footer (`CreatorCredit`). A compact unlinked `by Andrew Kam` also appears beneath the Pace Notes name in the shared header on every page. The site does not link to the Run_with_Kam Instagram account or show that handle. Public page titles use this name; compatibility URLs, research provenance, package names and the splithappens.run host remain stable.

`/request-analysis` provides a question and optional context field. `AnalysisRequest` prepares an encoded email to Andrew; visitors must send it through their own email app or Gmail. A copy fallback is available. This is a client-side email composer, not a server-side delivery service: never report a draft as submitted or delivered. The page stores no request text, and analytics receives only the allowed page path. No email provider keys or runtime API are required, preserving Next static export. A visible Request an analysis button in the shared top navigation, plus footer, About and analysis-directory links, make the page discoverable on desktop and mobile.

The homepage distinguishes raw race records from analyzed finishes. Both totals come from current calculation outputs, with a build-time check that the supporting study and personalized cohort agree. The explanation links to `/methodology#data-quality`; counts are performances, not unique runners.

## Visual system and stories

The redesign is documented in [the design system](DESIGN_SYSTEM.md). Fonts are self-hosted with `@fontsource-variable`. Story charts are hand-drawn SVG or Canvas components in `components/story`, `components/viz` and `components/art`. Recharts remains in the legacy analysis components, which were retheme-only changes. Story data is read at build time and verified by `lib/insights-server.ts`. Replay samples load in the browser through `lib/insights.ts`, which checks each file's SHA-256 against the manifest. A story page is generated only when its file is in the verified manifest.

## Runner tools

`/tools` holds eight client-side tools, each a static route under `app/tools/<slug>` with a client component in `components/tools`. They share the tool shell and inputs (`ToolShell`, `ui.tsx`), shareable URL state (`useQueryState`) and pure libraries in `lib/tools`. The data tools read the `tools/*` insights files in the browser through `loadInsight` and `loadShard`, which check SHA-256 against the manifest and the index's `shards` map. The index page lists a data tool only when its file is in the verified manifest. Panels of Pace Notes data, published research and official standards carry a badge; plain calculations carry none. Methods, data families, validation, privacy and the annual qualifying review are in [runner tools](TOOLS.md). The nav's first link is Tools; the footer links Runner tools.

Beside the tools, `/tools` has server-rendered reference pages for search: the marathon and half-marathon pace charts, five goal pages (`/tools/marathon-pace/<goal>`) and one page per qualifying race (`/tools/qualifying/<race>`). `/finish-times` sits at the top level. Their routes are in the table above; what they show is in [runner tools](TOOLS.md#pace-charts-goal-pages-and-qualifying-race-pages) and how they register for search is in [SEO](SEO.md#search-pages-october-2026).
