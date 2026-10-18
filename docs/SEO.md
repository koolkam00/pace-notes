# Search and social metadata

How Pace Notes tells search engines and link previews what each page is. Written October 8, 2026.

## What is indexed, and why

The route policy lives in [`lib/seo-routes.ts`](../lib/seo-routes.ts). The sitemap, page metadata and the SEO checks all read it, so there is one list to change.

| Pages | Robots | Canonical | In the sitemap |
| --- | --- | --- | --- |
| Home, the research hub `/research` (October 16, 2026), stories, tools, analyses, courses, about, methodology, privacy, slowdown | index, follow | the page itself | yes |
| The search pages: the two pace charts, the five goal pages, the six qualifying race pages and `/finish-times` ([below](#search-pages-october-2026)) | index, follow | the page itself | yes |
| The moved addresses' stubs (`movedTo()`, [below](#moved-addresses-october-18-2026)): `/packs` and every `/packs/<id>`, `/research/personalized`, `/your-race`, `/htw`, `/packs/smyth_htw` and the two weather questions | noindex, follow | none (`og:url` names the target) | no |
| `NOINDEX`: `/runners`, `/your-race`, `/request-analysis`, `/report`, `/design-system` | noindex, follow | none | no |
| 404 | noindex, follow (`app/not-found.tsx`; see the note below) | none | no |

`app/not-found.tsx` sets `robots: { index: false, follow: true }`, which replaces the layout's `index, follow`. Next.js adds its own `noindex` tag to the not-found page as well, so `out/404.html` carries two robots tags, `noindex` and `noindex, follow`, and they agree. The page is also served with a 404 status, so it is never indexed.

Reasons:
- **Moved addresses** answer a 308 on Vercel; their stubs exist only for a host that cannot redirect.
- **`/runners`** looks up recorded names. Runner profiles must never be indexable.
- **`/your-race`** is a client-side redirect (a moved address with no 308, so it can read old `#guide-*` links). **`/request-analysis`** is an email form.
- **`/report`** (October 16, 2026; repository state, not yet deployed) is one race's report, read from the nine times in its own address: no canonical, no structured data, no share card of its own (it uses the default words-only card) and not in the sitemap.

Query strings (`?units=`, `?race=`, `?goal=` and so on) never appear in a canonical, an `og:url` or the sitemap. The static export serves the same HTML for every query, so the canonical on the clean path covers all of them. Runner names, birth dates, labels and search text never go in a URL, the sitemap, structured data or analytics.

## Where metadata comes from

- **[`app/layout.tsx`](../app/layout.tsx)** sets site-wide defaults only:
  - `metadataBase` is hard-coded to `https://splithappens.run`. Without it, Vercel would fall back to the deployment host.
  - **Vercel previews point `og:image` at the preview host, by design.** Next.js 14.2 resolves a relative social image (every `og:image` and `twitter:image` here is a path such as `/og/tools/pace-band.png`) against the deployment's own URL (`VERCEL_BRANCH_URL`, else `VERCEL_URL`) whenever `VERCEL_ENV=preview`, ignoring `metadataBase` (`getSocialImageFallbackMetadataBase` in `next/dist/lib/metadata/resolvers/resolve-url.js`). This keeps previews from showing production images. Canonicals, `og:url`, the sitemap and JSON-LD use `absoluteUrl()` and stay on `https://splithappens.run`. Production builds (`VERCEL_ENV=production`) and local builds resolve images against `metadataBase`, so `https://splithappens.run`, which is what `verify-seo` checks. Do not "fix" a preview's image host; check production with `npm run verify:seo:live`.
  - Default Open Graph (`siteName` Pace Notes, `en_US`, `/og/default.png`), an X `summary_large_image` card and `robots: index, follow, max-image-preview:large`.
  - A fallback description that uses the build-time finish count.
  - Never put a canonical, `openGraph.url` or `title.template` here. Titles carry their own "| Pace Notes" suffix where it fits, so a template would double it.
- **[`lib/seo.tsx`](../lib/seo.tsx)** (server components only):
  - `pageMetadata({ title, description, path, type, noindex, canonicalPath, image, imageAlt, publishedTime, modifiedTime })` returns the title, description, absolute canonical, the full Open Graph block, the X card and robots. It throws if `path` contains `?` or `#`. A page-level `openGraph` replaces the layout's, so the helper always returns the whole object.
  - `finishesM()` gives the analysis cohort in millions ("3.4"), read from `analysis_n` in `public/data/insights/manifest.json`. Use it for every "N.N million" in a title or description, never a typed number.
  - `JsonLd` renders a JSON-LD block with `<` escaped. `breadcrumbs()` builds a BreadcrumbList; `pageCrumbs(path, name, { section, parents })` builds one with the page's chapter (`chapterCrumb()`: "Chapter 08 · Where you run", linked to `/research`) as its second crumb when the page is in the race (October 18, 2026; the course pages use it, and the other areas switch to it as they land).
  - `movedMetadata(path, title, description)` is the metadata of a moved address's stub.
- **[`lib/og-paths.ts`](../lib/og-paths.ts)** picks the social image for a page: its own card (a story, tool, goal page, qualifying race page, course or `/finish-times`), else the parent tool's card, else its section's card, else `/og/default.png`. It only returns files that exist in `public/`. See [Share cards](#share-cards-publicog).

How a page uses it:

```tsx
import { pageMetadata } from '@/lib/seo';
import { canonicalPathFor, isNoindex } from '@/lib/seo-routes';

export const metadata = pageMetadata({ title: 'Printable Marathon Pace Band for Any Goal | Pace Notes', description: '…', path: '/tools/pace-band' });

// A moved address's stub (noindex, og:url on the target; throws if lib/seo-routes.ts does not list the path as moved):
export const metadata = movedMetadata('/packs', 'Research Archive: Moved | Pace Notes', '…');
```

## robots.txt and the sitemap

- **[`app/robots.ts`](../app/robots.ts)** writes `out/robots.txt`. It allows everything except `/data/runners/index/` and `/data/runners/profiles/`, the two folders that hold recorded names. Pages render their charts from the rest of `/data`, so `/data`, `/_next`, `/og` and `/icons` stay crawlable. It also points to the sitemap.
- **[`app/sitemap.ts`](../app/sitemap.ts)** writes `out/sitemap.xml` from `sitemapEntries()`. It uses absolute URLs and no `priority` or `changefreq`, because Google ignores both.
  - The list comes from the same registries as the pages: `STORIES` (filtered by the data manifest, so `/stories/race-morning` arrives with its story), `TOOLS`, `TEN_ANALYSES` plus downhill-start, `getCourseNames()`, the fixed pages and `EXTRA_SITEMAP_PAGES` (the search pages). Since October 18, 2026 (branch state, not deployed) the research archive, `/research/personalized` and the two weather questions are moved addresses and out of the sitemap. That is 115 URLs on October 8, 2026 (101 before the search pages), and 117 on October 16, 2026 with the race planner (`/tools/plan`, through `TOOLS`) and the research hub (`/research`, a fixed page whose `CONTENT_DATES` entry is its `lastmod`; the home page's is 2026-10-16 too, for its new text).
  - `sitemapEntries()` throws if a path repeats, has a query or fragment, is noindex, or is not its own canonical.
  - **New content pages** register in their own module under [`lib/seo-pages/`](../lib/seo-pages/), which `EXTRA_SITEMAP_PAGES` in `lib/seo-routes.ts` collects (see [Search pages](#search-pages-october-2026)). A new entry in `TOOLS` is picked up automatically.
- **`lastmod` is honest.** It is the newest `as_of` date of the data the page shows (insights manifest, study, weather, personalized guide, fast-start, all-finisher, `pack_meta`, or `VERIFIED_AT` for qualifying and the qualifying race pages). Pages that are mostly written text use the hand-kept `CONTENT_DATES` map. When neither applies, `lastmod` is left out (`/privacy`, for example). The build never uses today's date or git dates. **When you change the visible text of a page in `CONTENT_DATES`, update its date.**
- Both routes use `dynamic = 'force-static'`, so they stay static files in the export.

## Search pages (October 2026)

Pages written for what runners search for, each static, indexable, its own canonical, in the sitemap, with a BreadcrumbList and its own share card. Numbers on them are computed at build time from the libraries and data named below; none is typed into the page.

| Page | Route | What it shows | Numbers | Sitemap module, `lastmod` |
| --- | --- | --- | --- | --- |
| `/tools/marathon-pace-chart` | `app/tools/marathon-pace-chart/page.tsx` | Pace per mile and per km for every goal in `MARATHON_CHART` (`lib/tools/pace-chart.ts`), the time at each 5 km mat and halfway, and mile markers | calculated at even pace, labelled as such | `lib/seo-pages/pace.ts`, the date the text was written (`PACE_CHARTS_WRITTEN`) |
| `/tools/half-marathon-pace-chart` | `app/tools/half-marathon-pace-chart/page.tsx` | The same for every goal in `HALF_CHART` | calculated | `lib/seo-pages/pace.ts`, `PACE_CHARTS_WRITTEN` |
| `/tools/marathon-pace/<goal>` (one per `GOAL_PAGE_MINUTES`: 3-00, 3-30, 4-00, 4-30, 5-00) | `app/tools/marathon-pace/[goal]/page.tsx` | Even-pace splits for the goal beside what finishes in the five minutes under it ran at each mat (the pace band's All-courses group), held pace against sustained slowdown, and finish-time bunching under the goal when the data shows it | calculated splits; Pace Notes data panels badged | `lib/seo-pages/pace.ts`, the later of the insights `as_of` date and 2026-10-08, when the pages were written (`GOAL_PAGES_WRITTEN`) |
| `/tools/qualifying/<race>` (one per `STANDARDS` key: boston, nyc, london, chicago, berlin, sydney) | `app/tools/qualifying/[race]/page.tsx`, `components/tools/QualifyingRace.tsx` | The race's official standards, window, age and application rules, what meeting a standard does not guarantee, Boston's published cut-offs, and even pace for each standard | official standards (dated `VERIFIED_AT`) and calculated even pace | `lib/seo-pages/qualifying.ts`, `VERIFIED_AT` |
| `/finish-times` | `app/finish-times/page.tsx`, `components/FinishTimeSummary.tsx` | Median finish (all, recorded women, recorded men), the minute-by-minute spread, observed shares under round times, percentiles and what the data covers | Pace Notes data (`lib/finish-times-summary.ts` reads `finish-times.json`, `courses.json` and the insights manifest) | `lib/seo-pages/finish-times.ts`, the later of the insights `as_of` date and 2026-10-08, when the page was written |

Five goal pages only, on purpose: one page per minute would be mass-produced near-duplicates. Internal links: the `/tools` index links both charts and the goal pages, the marathon chart links the goal pages, the qualifying checker and each race page link the race pages, and two pages link `/finish-times`: the round-numbers story (`/stories/round-numbers`, in its first section) and the finish-time-context analysis (`/analyses/finish-time-context`, in the aside after the analysis). No other analysis page links it.

**How a page registers.** A new search page needs four things, and the checks catch a missing one:
1. The route under `app/`, with `pageMetadata({ title, description, path })` (the canonical, Open Graph, X card and robots) and `JsonLd` breadcrumbs.
2. A module in [`lib/seo-pages/`](../lib/seo-pages/) that exports `ExtraPage[]` (`{ path, lastmod }`, typed in `lib/seo-pages/types.ts`), built from the route's own list (`GOAL_PAGE_MINUTES` with `goalPagePath`, `STANDARDS`), never a typed copy. `lastmod` is a `YYYY-MM-DD` string or a function such as `() => dataDate('insights')`; the function form lets the module import `dataDate` from `lib/seo-routes.ts`, which imports it back. Add the module to `EXTRA_SITEMAP_PAGES` in `lib/seo-routes.ts`. `sitemapEntries()` then lists the paths and throws on a repeat, an unclean path, a page that is noindex or not its own canonical, or a malformed date; `allSourceDates()` accepts the dates, so the `sitemap` check in `verify-seo` passes.
3. A share card: add the page to the card list in `scripts/build-og-images.cjs` (read from the same list), run `npm run og:images`, and commit the PNGs. Until then the page uses its parent's card and `verify-seo` warns (`og-image-fallback`).
4. Analytics: add the path to `searchPages` in [`lib/analytics-policy.ts`](../lib/analytics-policy.ts), from the route's own list where one is client-safe (`GOAL_PAGE_MINUTES` with `goalPagePath`, `STANDARDS`). Otherwise PostHog records the page as `/other`. `npm run verify:analytics` fails until it is there, because it checks that every sitemap page keeps its own path (see [ANALYTICS](ANALYTICS.md)).

**`verify-finish-times`.** [`scripts/verify-finish-times.cjs`](../scripts/verify-finish-times.cjs), the last step of `npm run verify:data`, checks every number `/finish-times` prints three ways: the helpers in `lib/finish-times-summary.ts` on small hand-made bins; an independent recount from `finish-times.json`, `courses.json` and the manifest, written without the helpers' code; and a rebuild of the story cohort from the checksum-verified runner shards in whole seconds, against which every printed figure must match exactly (about 400 MB, about 30 seconds; `--skip-records` skips this step). The goal pages' even-pace values and the goal list are checked by `scripts/verify-tools.cjs`.

## Course pages (October 2026)

**Release 1652 (October 17, 2026; branch `feat/release-1652`, not deployed).** The pages are rebuilt from `htw-db-2026-10-16-1652`: there are **28**, because the source policy now excludes Melbourne's only edition (2015, a partial load), so `/courses/melbourne` is no longer generated and leaves the sitemap (no redirect was added; decide whether one is wanted). Amsterdam now counts 11 editions (2023's 14 leftover finishes and the virtual 2020 are excluded), and Washington's twelve editions have no route or elevation because its supplied profile is now named "Marine Corps Marathon" ([refresh record](REFRESH_20261016_1652.md)). The worked examples below (29 pages, Amsterdam's 13 editions with 2023's 14 finishes) describe the 0934 build.

Added October 16, 2026 (StoryBrand PR E; repository state: on branch `feat/course-pages`, not merged; not deployed). The 29 pages at `/courses/<slug>` (one per course in the course-profile pack, `getCourseNames()`; same URLs as before) are written for what runners search for a race: its pacing, its elevation, its finish times by year and its race-morning weather. **Search demand is unmeasured.** Organic search brought 5 visitors in the 30 days to October 15, 2026, and Search Console is not connected, so these pages are a discovery bet, not a response to observed searches.

- **Titles.** `{race}: Elevation, Pacing and Finish Times`, or `{race}: Pacing and Finish Times by Year` for the two courses without a supplied route (Melbourne, Vienna), with " | Pace Notes" only when the whole title fits 60 characters (`courseTitle()` in `lib/course-page.ts`; none fits today, the shortest is 49 characters). The race name is the data's (the supplied route's race, else the course summary's): "Washington Marathon" stays until the owner decides.
- **Descriptions** come from the figures the page prints (`courseDescription()`): the race, the elevation profile where there is a route, finish times by year, the number of finishes, the editions that make them up and their span (Amsterdam: 13 editions, 2012–2024, 2023's 14 finishes included), and race-morning weather where the course has it, with clauses dropped until it fits 155 characters (110–155 today).
- **Structured data.** Each course page keeps its `BreadcrumbList` and has nothing else: no `FAQPage`, `SportsEvent` (the data has no future race dates) or `Dataset` (no licence yet). `/courses` gains a `BreadcrumbList` and an `ItemList` of the 29 pages in their alphabetical order, each `ListItem` with its position, the race name and the page URL.
- **`lastmod`** of a course page is the later of the insights `as_of`, the course-profile pack's `as_of` and `COURSE_PAGES_WRITTEN` (2026-10-16, in `lib/seo-routes.ts`, also accepted by `allSourceDates()`). Change that date when the pages' text is rewritten again.

**Redesign (October 17, 2026; WP5 on branch `rd/l3`, merging into `feat/redesign`; not deployed).** The pages keep their URLs, H1s, titles, descriptions, sections, section order and `section_viewed` ids, but each section is now one finding (its H2, a course nugget in `lib/nuggets/courses.ts`, recounted for every course by `scripts/nuggets/courses.cjs` through `verify-nuggets`) and one chart: the night hero (the share of finishes with a sustained slowdown, the route as its face with the climb, the edition range and a year strip); "What makes {city} {city}" (up to three rows: the first 5K's drop or climb, the slowest 5K against the usual one, and the shape row only where its shape picked the course out in at least half its editions); the median finish edition by edition; elevation on one height scale shared by every page (the largest relief among the pages' routes, rounded up to 50 m) with the section paces; the six pacing types against every course; every course on one strip; the five goals as a bar table that opens the planner; the race mornings as a scatter (the warmest and coolest named only 5 °C or more apart); plan links; the replay; and "Shaped like {city}" (the three nearest fingerprints with five or more editions), then the closing stack. Every long table (the whole course, edition by edition with each race morning, 5K by 5K, goal by goal, pacing types) is in one "All numbers" disclosure. Cut: the pooled pace profile, the fingerprint chart, the bibs, the "sum of the 5 km sections" climb total, the within-course slope sentence, the alphabetical and same-month neighbours, the tool and analysis cards (the course comparison and hills-and-pacing links are gone; `verify-courses` still checks them if they return), the hero's second and third buttons and the goal-time dek. `/courses` is one list of rows the chips sort (sustained slowdown, climb, finishes, start temperature, A–Z); its `ItemList` stays alphabetical. `verify-courses --html` was updated to match (each H2 against its nugget, the term linked at its first use, the tables in "All numbers", one climb total, the five goal links). `COURSE_PAGES_WRITTEN` still reads 2026-10-16: WP9 bumps the content dates.

**Review fixes (October 18, 2026; branch `rd/l3`, branch state, not deployed).** A section shows only when its data gives it something to show, so no page carries a heading over an empty chart: finish times need two editions, pacing the pacing types, goals the course chooser's rows (three or more editions), weather two race mornings, and "What makes {city} {city}" a row that sets the course apart. Its rows now say only what is distinctive, each from a guarded nugget: a first 5K that ends 10 m or more above or below its start (said as that net change, so it never reads as the elevation section's climb), a slowest 5K unlike the 25 of 27 courses whose slowest is 35–40K, a pacing shape recognised in at least three in four of five or more editions, and the 5K where the course's pace (against its own average) parts at least 2 points from the typical course's (`course.signature`, new); a course with none of these that has three or more editions says it "paces much like the typical course" over the two curves, and the rest (Barcelona, Paris, Prague on October 18) have no glance. The median-finish fill-in and the climb fill-in are gone. Every climb total (the hero, the elevation section, `/courses`) is now the sum of the route's nine 5 km sections (`routeClimb()`, data key `route.gain`), the same climbs the elevation readout gives one 5K at a time and the course chooser and a runner's race report print, so the whole route never climbs less than one of its 5Ks (it did on Amsterdam and Copenhagen, where the smoothed profile's total was under one section's climb); the smoothed profile keeps the drawing and the shared height scale, whose top is now a labelled hairline. The cross-course count under `#slowdown` counts only courses with three or more editions ("than 16 of 24 courses"), the hero's range reads low end first in no time order ("between 20% (2015) and 37% (2017)"), the median-finish chart spans at least 20 minutes with round-minute gridlines, the race-morning scatter opens on the warmer morning the sentence leads with and no longer joins the pair with a line, and the `/courses` description no longer says "Alphabetical, not ranked" (the list opens sorted by sustained slowdown).

What each page shows, in order. Every figure is a published field printed as it is (nothing is re-derived from the records), and each section names its own finishes and editions, because the cohorts differ (Madrid: 103,749 finishes over 13 editions in the story data, 50,939 over 7 for the pacing types, 44,025 over 6 for the goal rows).

**Since October 16, 2026 (insights only; repository state on `feat/insights-only`, not deployed):** the course pages show their findings and no method, source or coverage copy; that copy is on `/methodology#course-pages` and `#weather-routes`. The table below is the October 16 rewrite as first built; these parts of it no longer hold. The "About this data" section (`#data`, `CourseAbout`) is gone. The hero shows the sustained-slowdown share, the median finish and the climb, not editions, finishes or a supplied-route label. At a glance drops its coverage, small-edition and copy-edition sentences. Finish times by year has no copy-edition rows or sentence and no source or "not independently verified" note. The elevation totals are labelled "Whole route" and "Sum of the 5 km sections", with no "supplied", "measured two ways" or "context only" wording. `#slowdown` links the term to `/methodology#sustained-slowdown` instead of printing the definition and DOI, and no longer prints its finishes. Goal gaps say "Too few finishes at this pace." The weather section has no source link or verification flag. `/courses` cards show "Sustained slowdown X%" instead of a finish count. `verify-courses --html` asserts each of these absences and still checks every printed figure against its file.

| Section (H2, anchor) | `section_viewed` id | Data |
| --- | --- | --- |
| Hero: the race name (H1), the editions that make up the finishes and their years (`counted`: Amsterdam's 13, 2023 included), finishes, supplied route distance, climb labelled "smoothed route profile"; "Plan your {race}" (`planHref(city)`, all 29), and where the pace band publishes the course (27) "Make a {race} pace band" and "Check your {race} splits" | `hero` | `courses.json`, `course-geometry.json`, `tools/pace-band.json` scopes |
| "{race} at a glance" (`#at-a-glance`): three to six sentences: the finishes with the editions that make them up and, where one has under 100 finishes (Amsterdam 2023, 14), a sentence saying the edition medians and sustained-slowdown shares leave it out; the median labelled "mean of the edition medians"; and the contents | `chapter-1` | `courses.json` `courses[]`, `years.cells`; the small editions' eligible counts from their shards |
| "Finish times by year" (`#finish-times`): year, race date, finishes, median finish, sustained-slowdown share, start temperature; a row without numbers for each copy edition and one line for each under Chicago's table (`courseCopySentence()`: D2's `copyEditionSentence()` evidence, ending "so this page counts them only in the pooled pace profile", because D2's ending describes the runner search); the editions under 100 finishes named where the note says unlisted years are not in the data (Amsterdam 2023); the shard's "not independently verified" flag for race dates and starts | `chapter-2` | `years.cells`; the race date from each edition's runner-context shard |
| "Elevation profile" (`#elevation`, routes only): the profile, each climb total labelled by method: "smoothed route profile" always, "sum of the 5 km sections" where the course chooser publishes it (not Prague, all of whose editions it screens out), with "measured two ways" in the dek only when both are printed; the nine 5 km sections, the downhill opening, a profile that ends short; "Current supplied route; context only, not an adjustment" | `chapter-3` | `course-geometry.json`; `tools/course-goal.json` `courses[]`; runner-context `terrain.sections` |
| "How finishers paced each 5 km" (`#pacing`): pacing types, the fingerprint, the pooled profile; the start-offset note for the editions in `shape_cohort.start_offset_editions` (all of Prague) and Chicago's existing profile note | `chapter-4` | `archetypes.json`, `courses.json`, `ext_course_pacing_profiles` |
| "How often finishers held pace" (`#slowdown`): the definition and DOI, the mean sustained-slowdown share with its editions and finishes (the rows' finishes, over which the shares are averaged) and its range and years, the 20–40 km block, the time lost after 20 km; no all-finisher or pack figure (they still count Chicago's copies) | `chapter-5` | `courses.json` |
| "Goal times on the {race}" (`#goals`): the course chooser's rows at 3:00, 3:30, 4:00, 4:30 and 5:00 (static, no inputs; each goal links to the planner, named "Plan a {goal} {race}"), the reason where a row is not published, "Your goal: plan it", and the existing same-pace dots (`CourseMatched`, no ranks); on the 7 courses without rows the dek names only the method, and the callout says why | `chapter-6` | `tools/course-goal.json` `rows`, `unavailable`; `courses.json` `matched` |
| "Race-morning weather by year" (`#weather`, only with at least one weather row: not Frankfurt or Vienna): scheduled start, temperature, dew point, humidity, wind; the coolest/warmest sentence only when the two starts are at least `weather.pairs.min_gap_c` (5 °C) apart (not Sydney, Oslo, Auckland, Chicago or Dubai), and the same gate on the chart's accessible name, which pairs them only then; the within-course slope for the 12 courses that have one; "not independently verified" for the supplied dates and starts, and the source link (the shard's `documentation_url`, Open-Meteo's historical weather archive) | `chapter-7` | `courses.json` `weather`; the scheduled start, flag and source from the shard |
| "Plan your {race}" (`#plan`): the planner, pace band, course chooser, weather match, projector, split check and two analyses, each preset to the course only where its own index publishes it: the course comparison only where its all-finisher row for the course has a result (not Frankfurt, Melbourne, Paris, Singapore or Vienna), hills and pacing only with a supplied route (not Melbourne or Vienna); for the six qualifying races a separate "Official standards" card, "checked {VERIFIED_AT}" | `cta` | the tools' index files; `all-finisher-context/evidence.json`; `QUALIFYING_COURSE`, `VERIFIED_AT` |
| Replay (8 courses), unchanged | none | `replay.json` |
| "About this data" (`#data`): what each section counts (the course total with the editions that make it up; Amsterdam 2023 named as having no row and no place in the averages), and every edition left out with its reason (source policy, start delays, shifted mat grid, copies, no route, no weather row) | none | `pack_meta.json` `source_quality`; `courses.json` `shape_cohort`; `course-goal.json` `screens` |
| `PageFeedback`, then "Other courses" (`#other-courses`): the alphabetical neighbours and the courses run in the same month; never "similar" or "harder" | `related` | race months from the shards' race dates |

**`verify-courses`.** [`scripts/verify-courses.cjs`](../scripts/verify-courses.cjs) runs twice. As the last step of `npm run verify:data` (about 3 s) it tests the page helpers on fixtures (formats, temperatures that round to zero, which print "0°C", never "−0°C", the 5 °C gate, year lists, neighbours, months, titles, the copy-edition line against `copyEditionSentence()`'s evidence, and `countedEditions()`, including its refusal of a total its editions do not add up to), checks that the page code refuses runner context the story data was not built from (a scratch copy of `public/data` whose runner-context manifest differs only in its `as_of`, plus `boundContextManifest()` on the published bytes and six mutations: another `as_of`, geometry from another context, another runner-manifest timestamp, another release, a missing edition, story data with another input timestamp), and recounts from the files on its own: each edition's finishes against its checksum-verified runner-context shard, the course total as every non-copy shard of the city and the editions that make it up against the page model's `counted`, the mean median and the sustained-slowdown range against the editions, the weather rows against the shards and `weather-match.json`, the nine route sections against the course chooser's climb, descent, net and downhill flag, the course-profile pack as the story cohort plus the copies, and the two analyses' coverage from their own files (the course comparison's all-finisher rows; hills and pacing's terrain, which must be exactly the courses with a supplied route). With `--html`, appended to `npm run verify:seo` after the build, it reads all 29 exported pages: every printed figure is a `<data data-k="…">` element whose key names its field (the grammar is at the top of the script), and its value and its text in the default miles view must equal the file's; every edition, weather and goal row and route section must be printed, and no table cell may hold another number; one H1 (the race name) and no empty heading; each section present exactly when its data exists, with its tracking id; the definition and DOI in `#slowdown`; no banned or rank words (rank, fastest, toughest, harder, easier, similar, best, worst and the like); copy editions never printed with numbers, each line once, never the runner search's "shown as recorded times only", and no all-finisher figure that counts them; the course total printed only with the editions that make it up (no paragraph, list item or stat list pairs it with another edition count or year list) and the description's editions and span against them; each elevation total's label, the number of climb totals (two only where the course chooser publishes the section sum) and "two ways" only over two, and the context line; the 5 °C gate in the text and in every `aria-label` and `title` in `#weather`, and the slope sentence; "not independently verified" and the weather source link; `#slowdown`'s own finishes; every table in a named, focusable region; goal links named "Plan a {goal} {race}" and the goals dek only over the table; the small editions named in the table note and, where the goal rows count one, in "About this data"; every link to an exported page, course presets only where the target publishes the course, each analysis link exactly where it has a result, the planner on every page and the qualifying race page exactly on the six; only breadcrumbs as structured data; and on `/courses` the `ItemList` and each card's count, which must be the course page's (story data, without copy editions). On October 16, 2026 it checked 5,259 printed figures; injected mistakes (a wrong count, a missing DOI link, a hot/cool sentence on Sydney, a number in a copy row, an unknown key, a projector preset for Prague, "harder", a pace band preset for Melbourne and an empty H2) each failed it. After the same day's review fixes it checks 5,289 printed figures, and eleven more injected mistakes each failed it: a `/courses` card counting the Chicago copies, the warmest/coolest pairing in Sydney's chart name, a table region without its role, the runner search's copy-edition ending on Chicago, a course-comparison link on Melbourne, `#slowdown` without its finishes, no weather source link, the five-goal dek on Vienna, an unnamed goal link, Amsterdam's table note without 2023, and no "not independently verified". After the second review (October 16, 2026; repository state, not deployed) it checks 5,290 printed figures, and each new guard failed on what it replaces: the old context binding accepted the scratch copy (1 problem); a page model without `counted` failed all 29 recounts; and the previous export failed 36 built-page checks (Amsterdam's hero, "at a glance" and "About this data" printing its 129,673 finishes with 12 editions, the first two with those 12 editions' years, its description "across 12 editions (2012–2024)", Prague's "two ways" over one climb total, and `counted.editions` printed on none of the 29 pages).

## Icons and manifest

- `app/manifest.ts` writes `out/manifest.webmanifest`: name Pace Notes, paper colour `#F5F0E6`, `display: browser`, icons in `public/icons/` (192, 512 and a maskable 512).
  - With `NEXT_PUBLIC_BASE_PATH` set (the optional GitHub Pages build), the manifest's own paths carry the base path, but Next.js 14.2.5 writes the `<link rel="manifest">` tag as `/manifest.webmanifest` without it, so the manifest does not load there. Favicons, canonicals, Open Graph images and the sitemap are unaffected. The Vercel site has no base path.
- `app/icon1.png` (192 px) gives Google a PNG favicon; SVG is not a Google favicon format. `app/icon.svg`, `favicon.ico` and `apple-icon.png` stay.
- `public/og/default.png` is the 1200×630 share card for pages without a more specific one: the brand mark, "Pace Notes", a tagline and the credit. It has no numbers (they would go stale) and no runner names. It was rendered with Playwright from an HTML card using the site's fonts and colour tokens. If you replace it, keep it 1200×630 and at most 120 KB, like the other cards. The other cards are described in [Share cards](#share-cards-publicog).

## Share cards (`public/og/`)

Every page's `og:image` and X card is a 1200×630 PNG picked by `ogImageFor(path)` in [`lib/og-paths.ts`](../lib/og-paths.ts). It returns the most specific card that exists in `public/`:

| Page | Card | Text on the card |
| --- | --- | --- |
| `/stories/<slug>` | `og/stories/<slug>.png` | "Data story" and the kicker, the story title (`lib/stories.ts`) |
| `/tools/<slug>` | `og/tools/<slug>.png` | "Runner tools" and the group, the heading or title (`lib/tools/registry.ts`) |
| `/tools/marathon-pace-chart`, `/tools/half-marathon-pace-chart` | `og/tools/<slug>.png` | "Runner tools · Pace charts", the page's heading |
| `/tools/marathon-pace/<goal>` | `og/tools/marathon-pace/<goal>.png` | "Runner tools · Marathon pace chart", "4:00 marathon pace" (one per `GOAL_PAGE_MINUTES` in `lib/tools/pace-chart.ts`) |
| `/tools/qualifying/<race>` | `og/tools/qualifying/<race>.png` | "Runner tools · Qualifying times", the race name and the page's noun: "Boston Marathon qualifying times", London's "Good For Age times" (one per `STANDARDS` in `lib/tools/qualifying.ts`; no race year) |
| any other page below `/tools/<slug>` | the parent tool's card | |
| `/courses/<slug>` | `og/courses/<slug>.png` | "Courses · Course profile", the race name, and the supplied route outline when there is one |
| `/finish-times` | `og/pages/finish-times.png` | "Finish times · Median and distribution", "Marathon finish times" (`PAGE_CARDS` in the script; any top-level page outside the sections can have a card in `og/pages/`) |
| `/research` | `og/pages/research.png` | "Research · Stories, analyses and open data", "Explore the research" (October 16, 2026) |
| `/stories`, `/tools`, `/courses` | `og/sections/<section>.png` | the section's own line |
| `/analyses` and every analysis page | `og/sections/analyses.png` | |
| `/packs` and every pack page | `og/sections/packs.png` (the research archive) | |
| everything else (home, about, methodology, slowdown, …) | `og/default.png` | |

If a page has no card yet, it falls back to the parent tool's card, then the section card, then the default, so a page never points at a missing file. `verify-seo` warns when a page uses a less specific card than the one the script makes for it: it reads the script's card list (`plannedCards()` in `scripts/build-og-images.cjs`, no browser needed), so a new goal page, race or story is expected to have its own card as soon as its list includes it. A goal time on a card ("4:00 marathon pace") is the page's name, not a data number.

**Rules for the cards:** words only (the brand, a section label, the title or race name, and "by Andrew Kam"); no data numbers, because they would go stale; no runner names; 1200×630; at most 120 KB each (63 cards, 32–81 KB, 3.2 MB in all on October 8, 2026). The race name follows the course page's rule: the supplied route's race name, else the course summary's, else the city plus " Marathon". "Washington Marathon" is shown as the data names it; if the owner renames that race, re-run the script.

**Making them.** [`scripts/build-og-images.cjs`](../scripts/build-og-images.cjs) renders the cards with Playwright and headless Chromium from an HTML template in the default card's design: Fraunces and Inter from `node_modules/@fontsource-variable` (the same stylesheets `app/layout.tsx` imports), the night background and accents from `app/globals.css` (the script stops if those tokens change), and each story's or tool's accent colour. It loads `playwright` from `node_modules` (a devDependency since October 14, 2026, for the browser privacy checks), else `/opt/node-tools/node_modules/playwright`; `npx playwright install chromium` installs the browser.

```bash
npm run og:images                                  # render missing or changed cards; unchanged ones are skipped
node scripts/build-og-images.cjs --force           # render every card again
node scripts/build-og-images.cjs --only courses/   # only cards whose file name contains the text
npm run og:check                                   # no browser: report missing, changed, oversized or orphaned cards
```

Re-run it, and commit the PNGs, when you add or rename a story, tool, goal page, qualifying race or course, change a title, kicker, tool heading, race name or accent, or change the card design. Delete the cards it reports as orphans. Then run `npm run build` so the pages pick up the new files.

The card list comes from the registries in a fixed order (stories, tools, the pace charts, `GOAL_PAGE_MINUTES`, `STANDARDS`, courses, pages, sections), so runs are repeatable. Cards below a tool sit in a folder named after it (`og/tools/qualifying/boston.png`); `og:check` scans those folders for orphans too. Each PNG carries a `tEXt` chunk (`pace-notes-og`) with a hash of its HTML (text, layout, colours and the font package versions); that is how the script skips unchanged cards and how `og:check` spots stale ones without a browser. Pixels are identical between runs on the same machine; another Chromium or font build may anti-alias slightly differently, which only shows up as a binary change.

## Automated checks: `verify-seo`

[`scripts/verify-seo.cjs`](../scripts/verify-seo.cjs) reads the static export and fails if any page breaks the rules on this page. It loads `lib/seo-routes.ts` (and `finishesM()` from `lib/seo.tsx`) with the same TypeScript require hook as `scripts/verify-units.cjs`, so it checks the build against the same policy the pages were built from. It has no dependencies and takes a few seconds.

```bash
npm run build && npm run verify:seo
node scripts/verify-seo.cjs --out <folder>    # another export folder
node scripts/verify-seo.cjs --all             # list every page in a failed group, not just the first 25
node scripts/verify-seo.cjs --self-test       # only the built-in fixtures; no export needed
```

Every run starts with a self-test: the banned-words patterns against fixture phrases ("your personal chance", "your own personal chances", and phrases they must not catch, such as "your race. Chance …") and a small fixture page, parsed by the same code as the export, that must hit "your chance" in its description, `og:title`, visible text and alt text. If a fixture fails, the script stops before reading the export.

CI runs it after `npm run build` in [`site-validation.yml`](../.github/workflows/site-validation.yml). Failures are grouped by check, with the page and the reason; the script exits 1 if any check fails. Since October 16, 2026 `npm run verify:seo` then runs `node scripts/verify-courses.cjs --html`, the built-page checks of the course pages ([above](#course-pages-october-2026)).

| Check | Fails when |
| --- | --- |
| `head-tags` | a page (404 excepted) lacks exactly one non-empty `<title>`, meta description or `<h1>` |
| `robots-meta` | noindex is missing from a `NOINDEX` path, a moved address's stub or the 404, is on any other page, or two robots tags disagree |
| `canonical` | an indexable page lacks exactly one canonical, or it is off `https://splithappens.run`, has `?`, `#` or a trailing slash, or differs from `canonicalPathFor(path)`; or a noindex page has one |
| `stubs` | a moved address (`movedPages()`) has no stub in the export, or its stub lacks the H1 "This page has moved", a visible link to the target, the forward (one `<script data-forward>`, whose target, base path and, on the guide's two stubs, `#guide-*` map must match `lib/seo-routes.ts`) or `og:url` on the target, or carries JSON-LD; or the target is missing, noindex, or lacks the `#anchor` it names; or a built page is a moved address `movedPages()` does not list |
| `redirects` | `vercel.json`, matched the way Vercel matches it (in order, first match wins; `:name*` also matches nothing), does not 308 a moved address to `movedTo()` (the forward-only `/your-race` must not redirect), redirects a sitemap or indexable page, sends a rule to a page that is not built and indexable, or answers anything but 308 |
| `moved-links` | a page links a moved address instead of its target (pages another package is still rebuilding are reported as warnings, `PENDING_LINKS`, until it lands; an entry that no longer applies fails) |
| `social-tags` | an indexable page lacks `og:title`, `og:description`, `og:image`, `twitter:card` or `og:url`, or `og:url` is not the canonical |
| `og-image` | an `og:image` or `twitter:image` is off the host, missing from the export, or not 1200×630 (read from the PNG, JPEG or WebP header) |
| `duplicates` | two indexable pages share a title or a description |
| `sitemap` | `sitemap.xml` does not parse, repeats a `<loc>`, has a relative or unclean `<loc>`, lists a page that is missing, noindex or not its own canonical, misses an indexable self-canonical page, disagrees with `sitemapEntries()`, or has a `lastmod` in the future or not among the data and content dates |
| `robots-txt` | the `Sitemap:` line is missing, a group disallows `/`, any group blocks the pages, `/_next/`, `/data/` (outside the two runner folders), `/og/` or `/icons/`, or the runner folders are not blocked |
| `json-ld` | a block does not parse, its `@context` is not schema.org, a `Person` is anyone but "Andrew Kam" or carries a URL, `/runners` has any, a `ProfilePage` appears, a site URL has a query, or breadcrumb positions are not 1..n or point off the host |
| `banned-words` | "the wall", "arithmetic" or "your chance" (any form: "your chances", or up to two words between, as in "your personal chance") is in visible text, alt, title or aria-label text, metadata or JSON-LD |
| `fastest` | "fastest" is in a title, description, `<h1>` or og/X tag (body text may use it) |
| `runner-counts` | a title or description says "million runners" or "N runners" (counts are finishes) |
| `personal-data` | `q=` is in a canonical, `og:url`, the sitemap or JSON-LD, or `/runners` is not noindex |
| `units-links` | an internal `href` in the static HTML carries `units=mi`, the default unit |
| `old-host` | `htw-live-study.vercel.app` is in any `<head>` (or in JSON-LD) |
| `finish-counts` | an "N.N million" or "N.NM" in a title or description is not `finishesM()` |
| `orphans` | a story or analysis page in the sitemap is not linked from `/research`, or any other sitemap page but the home page is linked from no other page in the export (October 16, 2026) |
| `home-form` | the home page's course select (`#home-plan-course`) does not have the planner's options (`#plan-course` on `/tools/plan`), the same values and names in the same order: the home list comes from the course pages, the planner's from its own data (October 16, 2026) |

Warnings only: titles over 60 characters, descriptions over 155 (the site's limits), `pending` (links and anchors another redesign package changes when it lands), `og-image-fallback` (a page that uses a less specific card than the one `scripts/build-og-images.cjs` makes for it: a stale build or a missing card), and policy notes (noindex pages that also say nofollow, JSON-LD on pages the plan keeps without it, `changefreq` or `priority` in the sitemap).

## Moved addresses (October 18, 2026)

Branch state on `feat/redesign`, not deployed. The redesign closed the research archive (`/packs` and its 84 question pages), the archived personalized guide (`/research/personalized`) and the two weather-question pages (now tabs of race-day weather). Each old address is listed in `lib/seo-routes.ts`: `movedTo(path)` says where it went and `movedPages()` lists every address that keeps a stub.

- **On Vercel** each answers a 308 from `vercel.json`, so a visitor never sees the old page. A 308 keeps the query; the browser keeps the visitor's `#hash` unless the target names its own (`#downloads`, a weather tab).
- **The stub** (`components/MovedPage.tsx`) is for a host that cannot redirect (the optional GitHub Pages build): the H1 "This page has moved", one sentence, one button to the target, and `components/LegacyAnalysisLink.tsx`, a small classic script in the page that replaces it with the target while the HTML is read, with no JavaScript bundle (base path, query and hash kept as a 308 would; the guide's two stubs also send an old `#guide-<question>` link to the analysis that answers it). Stubs are noindex, have no canonical link and no JSON-LD, and name the target in `og:url`.
- **`/your-race`** is the one moved address without a 308 (`FORWARD_ONLY`): a redirect would drop the hash before the page could read it.
- **The data stays.** The research packs' files under `public/data/packs/` are unchanged and published; `/methodology#downloads` lists them.
- `verify-seo` checks the stubs (`stubs`), matches `vercel.json` against `movedTo()` the way Vercel does (`redirects`), and fails when a page links an old address (`moved-links`); `verify-seo-live` asks the live site for every path redirect in `vercel.json` after a deploy.

## After a deploy: `verify-seo-live`

[`scripts/verify-seo-live.cjs`](../scripts/verify-seo-live.cjs) checks what only the live site can show. Run it by hand right after each production deploy; it prints PASS or FAIL per check and exits 1 on any failure.

```bash
npm run verify:seo:live
node scripts/verify-seo-live.cjs --base https://<preview>.vercel.app   # path checks only; host checks are skipped
```

| Check | Passes when |
| --- | --- |
| www host | `https://www.splithappens.run/tools?x=1` answers 308 to `https://splithappens.run/tools?x=1` |
| old host | `https://htw-live-study.vercel.app/slowdown?a=1` answers 308 to `https://splithappens.run/slowdown?a=1` |
| `/htw`, `/packs/smyth_htw` | each answers 308 to `/slowdown` |
| every other path redirect in `vercel.json` (October 18, 2026) | answers 308 to its destination, `#anchor` included; a `:name` parameter is tried with a sample segment (`/packs/r01_banking_time`) |
| `/robots.txt` | 200 `text/plain`, with the `Sitemap:` line and no `Disallow: /` |
| `/sitemap.xml` | 200 XML with a sitemaps.org `<urlset>`, and every `<loc>` answers 200 without a redirect |
| `/data/insights/manifest.json` | sends `X-Robots-Tag: noindex` |
| `/runners?q=x` | sends `X-Robots-Tag: noindex, nofollow` |
| `/tools/`, `/tools.html` | `/tools/` answers 308 to `/tools` (which answers 200) in one hop; `/tools.html` answers 404 |
| `/data/live.json` | answers 200 and parses as JSON (the pacing-analysis workflow reads it with `curl --fail`, no `-L`) |
| home page | has the canonical `https://splithappens.run` and an `og:image` that loads as a 1200×630 PNG |

On a preview, the host checks are skipped, and Vercel already sends `x-robots-tag: noindex` on every preview response, so the header checks prove only that a header is there.

Status on October 8, 2026, before this work was deployed: 3 of 13 checks pass (`/tools/`, `/tools.html` and `/data/live.json`), 9 fail and the sitemap-URL check is skipped because there is no sitemap yet. www answers 307, not 308 (an owner setting; see the checklist below). The old host, `/htw` and `/packs/smyth_htw` answer 200. `robots.txt` and `sitemap.xml` are 404. Neither `X-Robots-Tag` header is sent, and the home page has no canonical. All of those should pass once the integration branch is deployed and the www redirect is changed. **After the deploy (PR #53, `248487e`) and the www change to 308, all 13 checks passed; they passed again on October 13, 2026.**

## Redirects and headers ([`vercel.json`](../vercel.json))

Next.js `redirects()` and `headers()` do not work with `output: 'export'`, so these live in `vercel.json`:

| Rule | Effect |
| --- | --- |
| Host `htw-live-study.vercel.app`, any path | 308 to `https://splithappens.run/<same path>` |
| `/htw` | 308 to `/slowdown` |
| `/packs/smyth_htw` | 308 to `/slowdown` |
| `/tools/marathon-pace` | 308 to `/tools/marathon-pace-chart` (the goal pages sit below this path, which has no page of its own) |
| `/courses/melbourne` | 308 to `/courses` (October 17, 2026: Melbourne's only edition is excluded in release 1652, so the page is not built) |
| `/packs`, `/packs/:id*` | 308 to `/methodology#downloads` (October 18, 2026: the research archive closed; its data files stay under `/data/packs/`). The `/packs/smyth_htw` rule comes first, so that address keeps `/slowdown` |
| `/research/personalized` | 308 to `/research` (the guide's questions are the analyses) |
| `/analyses/warming-and-pacing`, `/analyses/wind-and-pacing` | 308 to `/analyses/race-day-weather#warming` and `#wind` (tabs of race-day weather) |
| Every path | `Referrer-Policy: strict-origin`, the same policy as the `<meta name="referrer">` tag from `app/layout.tsx`, so the requests a page makes before that tag is parsed also send only the origin |
| Every `.txt` path except `/robots.txt` | `X-Robots-Tag: noindex` (the React Server Components payloads the export writes beside each page, such as `out/tools.txt`, which the client fetches on in-app navigation) |
| `/data/*` | `X-Robots-Tag: noindex` (files stay downloadable and fetchable) |
| `/runners` with a `q` query | `X-Robots-Tag: noindex, nofollow` (old links that carry a name) |
| `trailingSlash: false` | `/tools/` goes to `/tools` in one hop, as before |

The pacing-analysis workflow reads `https://splithappens.run/data/live.json` directly. It uses `curl --fail` without `-L`, so it must never point at the old host.

### What a preview deployment cannot test

- **The host redirect.** Preview URLs have a different host, so the rule never fires there. Previews also already send `x-robots-tag: noindex`, so check that the `/data` and `/runners?q=` headers are present, not their value.
- **Whether a redirect beats an existing static file** (`out/htw.html`) and **whether query strings survive the host 308.** Neither is verified yet; check both in production.
- **The production `og:image` host.** On a preview, `og:image` and `twitter:image` name the preview host (`VERCEL_ENV=preview`; see [Where metadata comes from](#where-metadata-comes-from)). Only a production deploy shows `https://splithappens.run/og/…`.

Right after each production deploy (keep Vercel Instant Rollback ready), run `npm run verify:seo:live` ([above](#after-a-deploy-verify-seo-live)). It makes these requests and more; the same checks by hand:

```bash
curl -sI 'https://htw-live-study.vercel.app/slowdown?a=1'   # 308, location https://splithappens.run/slowdown?a=1
curl -sI 'https://splithappens.run/htw'                      # 308, location /slowdown
curl -sI 'https://splithappens.run/packs/smyth_htw'          # 308, location /slowdown
curl -sI 'https://splithappens.run/data/insights/manifest.json' | grep -i x-robots-tag   # noindex
curl -sI 'https://splithappens.run/runners?q=x' | grep -i x-robots-tag                   # noindex, nofollow
curl -sI 'https://splithappens.run/tools/'                   # 308 to /tools in one hop
curl -sI 'https://splithappens.run/tools/marathon-pace'      # 308, location /tools/marathon-pace-chart
curl -sI 'https://splithappens.run/packs/r01_banking_time'   # 308, location /methodology#downloads
curl -sI 'https://splithappens.run/tools.txt' | grep -i -e x-robots-tag -e referrer-policy   # noindex; strict-origin
curl -s  'https://splithappens.run/robots.txt'               # the rules above and the Sitemap line
curl -s  'https://splithappens.run/sitemap.xml' | grep -c '<loc>'
curl -sf 'https://splithappens.run/data/live.json' | python3 -m json.tool > /dev/null && echo live.json ok
```

## Owner checklist (outside the repo, after the deploy)

- [x] **Right after the production deploy.** (Done: 13 of 13 passed after PR #53 and again on October 13, 2026.) Run `npm run verify:seo:live` ([above](#after-a-deploy-verify-seo-live)); every check should PASS once the www redirect below is 308. Keep Vercel Instant Rollback ready.
- [x] **Vercel www redirect.** (Done: `www.splithappens.run` redirects with 308.) Project → Settings → Domains. Set `www.splithappens.run` to "Redirect to splithappens.run" with **308 Permanent** (add it if it is not listed). Before the change it answered 307. Check: `curl -sI 'https://www.splithappens.run/tools?x=1'` returns 308 to `https://splithappens.run/tools?x=1`.
- [x] **Old vercel.app host.** (Done: covered by the live check, which passes.) Run the first `curl` above. If it does not return 308, set the redirect in Settings → Domains instead. Do not remove the domain.
- [ ] **Google Search Console.** (The `google-site-verification` TXT record was added in Vercel DNS and resolves publicly; the owner finishes verification in Search Console.) Add a Domain property for `splithappens.run` and verify it with a TXT record in Vercel DNS. Submit `sitemap.xml`. Request indexing for `/`, `/tools/pace-calculator`, `/tools/qualifying`, `/tools/marathon-pace-chart`, `/finish-times`, `/courses`, `/courses/boston`, `/stories/round-numbers` and `/slowdown`.
- [ ] **After two to three weeks.** Inspect `/slowdown`: Google's chosen canonical should be on `splithappens.run`. Since the October 2026 redesign the old pack pages answer 308 and should drop out as "Page with redirect". Look into any "Duplicate, Google chose different canonical".
- [ ] **Bing Webmaster Tools.** Import the site from Search Console, or add it and verify by DNS. Submit `https://splithappens.run/sitemap.xml`.
- [ ] **GitHub.** Set the repository's About → Website to `https://splithappens.run`.

### Known minor items (left as they are)

- **The host redirect's value is unescaped on purpose.** The old-host rule in `vercel.json` matches `htw-live-study.vercel.app` with its dots unescaped. As a regular expression an unescaped dot also matches a dot, so the rule works whether Vercel reads the value as a literal host or as a pattern; escaping it would only be right under one of the two readings.

### Decisions still open for the owner

- **"Washington Marathon".** The course data (`course-geometry.json`, `courses.json`) names the race "Washington Marathon", and the course page, its title and its share card show that name. It may really be the Marine Corps Marathon. Only the owner can confirm; if it is renamed in the data, rebuild and re-run `npm run og:images`.
- **A licence for the Dataset JSON-LD.** `/methodology` describes the story summaries as a schema.org `Dataset` without a `license`, because the repository states none. Google Dataset Search recommends one. Choose a licence first; then add it to the repository and to `storyDataset()` in `app/methodology/page.tsx`.
- **Search Console and Bing verification.** The Domain property, the TXT record and the sitemap submissions above are owner steps; nothing in the repository can do them.
