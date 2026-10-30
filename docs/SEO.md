# Search and social metadata

How Pace Notes tells search engines and link previews what each page is. It describes the code on `main` (first written October 8, 2026); dated records of earlier states are in [history](history/seo-2026-10.md).

## What is indexed, and why

The route policy lives in [`lib/seo-routes.ts`](../lib/seo-routes.ts). The sitemap, page metadata and the SEO checks all read it, so there is one list to change.

| Pages | Robots | Canonical | In the sitemap |
| --- | --- | --- | --- |
| Home, the research hub `/research` (October 16, 2026), stories, tools, analyses, courses, about, methodology, privacy, slowdown | index, follow | the page itself | yes |
| The search pages: the two pace charts, the five goal pages, the six qualifying race pages and `/finish-times` ([below](#search-pages-october-2026)) | index, follow | the page itself | yes |
| The moved addresses' stubs (`movedTo()`, [below](#moved-addresses-october-18-2026)): `/packs` and every `/packs/<id>`, `/research/personalized`, `/your-race`, `/htw`, `/packs/smyth_htw` and the two weather questions | noindex, follow | none (`og:url` names the target) | no |
| `NOINDEX`: `/runners`, `/your-race`, `/request-analysis`, `/report` | noindex, follow | none | no |
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
  - The list comes from the same registries as the pages: `STORIES` (filtered by `storyPublished`, so a story arrives with its data), `TOOLS`, `TEN_ANALYSES` plus downhill-start, `getCourseNames()`, `/charts` and its hundred pages, `/half` when the half data is in the build, the fixed pages and `EXTRA_SITEMAP_PAGES` (the search pages). Moved addresses are never listed. The count is whatever these registries hold; `verify-seo` `sitemap` checks every entry against the export.
  - `sitemapEntries()` throws if a path repeats, has a query or fragment, is noindex, or is not its own canonical.
  - **New content pages** register in their own module under [`lib/seo-pages/`](../lib/seo-pages/), which `EXTRA_SITEMAP_PAGES` in `lib/seo-routes.ts` collects (see [Search pages](#search-pages-october-2026)). A new entry in `TOOLS` is picked up automatically.
- **`lastmod` is honest.** It is the newest `as_of` date of the data the page shows (insights manifest, study, weather, personalized guide, fast-start, all-finisher, `pack_meta`, or `VERIFIED_AT` for qualifying and the qualifying race pages). Pages that are mostly written text use the hand-kept `CONTENT_DATES` map. When neither applies, `lastmod` is left out (`/privacy`, for example). The build never uses today's date or git dates. **When you change the visible text of a page in `CONTENT_DATES`, update its date.**
- **The merge day moves dates.** A page whose visible text changes takes the merge day as its `lastmod`, so the hand-kept dates are set in the merge commit, on the day it merges: `published` in `lib/stories.ts` for a new story (its JSON-LD `datePublished` and `article:published_time`, `app/stories/[slug]/page.tsx`), the page's entry in `CONTENT_DATES`, `COURSE_PAGES_WRITTEN` when the course pages' text changes, and `HALF_TEXT_WRITTEN` for the half lines on host pages (all in `lib/seo-routes.ts`). A data date that equals production's tells search engines nothing changed. `verify-seo --today <date>` (default: today, UTC) fails a `lastmod` after that date, so a date set ahead of the merge fails until the day comes.
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

One page per course at `/courses/<slug>` (`getCourseNames()`, from the course-profile pack: 27 under `private-export-20261021-1050`), written for what runners search for a race: its pacing, its elevation, its finish times by year and its race-morning weather. Search demand for them is unmeasured (the pages' first record, with the October 2026 numbers, is in [history](history/seo-2026-10.md)). A course that leaves the data answers a 308 to `/courses` ([redirects](#redirects-and-headers-verceljson)): `/courses/melbourne` since release 1652 and `/courses/vienna` since release 1050 (no eligible edition; [1050 refresh](REFRESH_20261021_1050.md)).

- **Titles.** `courseTitle()` in `lib/course-page.ts`: `{race}: Elevation, Pacing and Finish Times`, or `{race}: Pacing and Finish Times by Year` for a course without a drawn route, with " | Pace Notes" only when the whole title fits 60 characters. The race name is the data's (the supplied route's race, else the course summary's): "Washington Marathon" stays until the owner decides ([below](#decisions-still-open-for-the-owner)).
- **Descriptions** come from the figures the page prints (`courseDescription()`): the race, the elevation profile where there is a route, finish times by year, the number of finishes, the editions that make them up and their span, and race-morning weather where the course has it, with clauses dropped until it fits 155 characters.
- **Structured data.** Each course page keeps its `BreadcrumbList` and has nothing else: no `FAQPage`, `SportsEvent` (the data has no future race dates) or `Dataset` (no licence yet). `/courses` has a `BreadcrumbList` and an `ItemList` of the course pages in alphabetical order, each `ListItem` with its position, the race name and the page URL.
- **`lastmod`** of a course page is the later of the insights `as_of`, the course-profile pack's `as_of` and `COURSE_PAGES_WRITTEN` (in `lib/seo-routes.ts`, also accepted by `allSourceDates()`). Change that date when the pages' text is rewritten.

What a page shows, in order (`app/courses/[city]/page.tsx`): the night hero (the race name as H1, the course's reading and `#plan`, "Plan your {race}", the call to action), a contents row when four or more sections show, then one finding and one chart per section, each only where the course's data gives it something to show:

| Section | Anchor | `section_viewed` id | Shown when |
| --- | --- | --- | --- |
| At a glance | `#at-a-glance` | `chapter-1` | it has rows (`glanceRows`) |
| Finish times by year | `#finish-times` | `chapter-2` | three or more editions and the `course.times` guard (`timesShown`) |
| Elevation | `#elevation` | `chapter-3` | a drawn route that does not sit under water, and the `course.climb` guard (`elevationShown`) |
| Pacing | `#pacing` | `chapter-4` | the course has pacing types |
| Sustained slowdowns | `#slowdown` | `chapter-5` | always |
| Goal times | `#goals` | `chapter-6` | the course chooser has rows for the course |
| Race-morning weather | `#weather` | `chapter-7` | a hot-and-cool pair of mornings, enough weather rows (`WEATHER_MIN_MORNINGS`) and the `course.weather` guard |

The long tables sit in one All numbers fold (`#all-numbers`, `CourseNumbers`), which ends on "How these were measured →". The page closes on `#other-courses` (`related`): the next card, the way back and "Was this useful?". Every figure is a published field printed as it is, through `Fact` (`<data value="…" data-k="…">`), and each sentence is a course nugget (`lib/nuggets/courses.ts`) with its guard. The pages carry no method, source or coverage copy (insights only): that is on `/methodology#course-pages` and `#weather-routes`, and "sustained slowdown" links to its definition there.

**`verify-courses`.** [`scripts/verify-courses.cjs`](../scripts/verify-courses.cjs) runs twice; the list at the top of the script is the contract. As the last step of `npm run verify:data` it tests the page helpers on fixtures, checks that the page code refuses runner context the story data was not built from, and recounts every edition's finishes, the course totals and the editions that make them up, the medians and sustained-slowdown range, the weather rows, the route sections and the course-profile pack from the published files, without the page code. With `--html`, appended to `npm run verify:seo` after the build, it reads every exported course page and `/courses`: every printed figure against its file (value and text in the default miles view), every edition and goal row present, no other number in a table cell, one H1, the sections the data supports and no others, each section's H2 and the hero's sentence exactly the course nuggets', no method, source or coverage copy, no banned or rank words, copy editions never printed with numbers, the course total named only with the editions that make it up, the 5 °C gate, table regions with names, links only to exported pages with presets only where the target publishes the course, the planner on every page and the qualifying page on the six qualifying courses, breadcrumbs as the only structured data, and on `/courses` the `ItemList` and each row's share. The key grammar for `data-k` is at the top of the script; an unknown key fails.

## Top 100 charts (October 2026)

Added October 23, 2026 (PR #81, merged as `24caac1` and live the same day; the production sitemap lists all 101 pages). `/charts` and the hundred pages `/charts/1` … `/charts/100` are indexable and in the sitemap; their `lastmod` is the charts manifest's date (`dataDate('charts')`), so a data rebuild moves it and nothing else does. Each chart page's title is the chart's title (`<title> | Pace Notes`), its description the takeaway's plain sentence (without the accent marks) or the chart's own description, its canonical the numbered address, and it carries `BreadcrumbList` structured data (Pace Notes › Top 100 charts › the chart). The section's share card is `/og/sections/charts.png` (`lib/og-paths.ts`); each page's own card image is the chart's Instagram card, `/charts/cards/<number>.png`, linked as "Save the image" on the page. The section's one way in from the core site is a line on `/research`; it is off the chapter chain, so `verify-chapters` does not count it.

## The half marathon (October 2026)

Added by pull request #85 (merged as `a2c6e507`, October 30, 2026). Two pages join the sitemap, both indexable, both built only when the verified half data is in the build:

- **`/half`**: "Half Marathon Finish Times: What the Field Ran | Pace Notes" (59 characters). The description is built from the page's first two readings when both guards hold, "Just over half of half marathon finishes came in under 2:00, 1 in 4 under 1:45. Women and men, round times, and the same cities’ marathons." (the field reading alone otherwise). Breadcrumbs "Pace Notes › The half marathon" (JSON-LD `BreadcrumbList`); share card `og/pages/half.png`. Sources `half` (`dataDate('half')`, the half manifest's `as_of`); `CONTENT_DATES` October 30, 2026. Both guards still hold after the stamp correction of October 30, 2026 (55.2% under 2:00, 25.8% under 1:45), so the description is unchanged.
- **`/stories/half-to-full`**: from the `half.extra` nugget: while its guard holds, "Half to Marathon: Double It Plus 21 Minutes | Pace Notes" and "After a half, the typical marathon took double it plus 21 minutes. See the marathons that followed each half time, 3 to 16 weeks later."; without it, "From the Half to the Marathon | Pace Notes" and a description without the figure. Since the stamp correction (October 30, 2026) the guard fails (the verified-halves weighting, now 8.5% of the pairs, took +16 minutes over double; [half marathons](HALF_MARATHON.md#what-is-published)), so the page ships the second pair and its share card shows the fallback heading; the page's figure, and the chapter 11 row's, is the 23,929 pairs (review, October 30, 2026). Source `half`; `CONTENT_DATES` October 30, 2026.
- **Dates:** the story's `published` (`lib/stories.ts`: the page's JSON-LD `datePublished` and its `article:published_time`) and the `CONTENT_DATES` of `/half`, `/stories/half-to-full` and `/methodology` (`lib/seo-routes.ts`; `/methodology` for its half folds and downloads) say October 30, 2026, the owner's merge day ("publish everything and full merge"). If the merge slips past that day, move them, the host pages' dates below and `HALF_TEXT_WRITTEN` to the merge day in the merge commit, so neither the story's date nor the sitemap predates the pages going live.
- **Host pages** take the half data date in their `lastmod`: `/research` (chapter 11's lead is the half story's reading) and the predictor (its half panel) add the `half` source in `sitemapEntries()` (`lib/seo-routes.ts`); the half pace chart (the later of its text date and `halfDataDate()`) and the five goal pages (the later of the insights date, their text date and `halfDataDate()`) take it in `lib/seo-pages/pace.ts`. `allSourceDates()` includes the half date when the data is present.
- **And the merge day.** The half data's date (October 29) was production's `lastmod` for most host pages already, so the merge would have changed no date where the visible text changed (review, October 30, 2026). The `CONTENT_DATES` of `/`, `/research`, `/about` and `/stories/who-holds-pace` (each gains a half row, line or link) are October 30, 2026; the predictor, the five goal pages, the half pace chart and `/finish-times` take `HALF_TEXT_WRITTEN` (October 30, 2026, through `halfTextDate()`, only in a build with the half data). If the merge slips past that day, move these with the story's `published` and the other `CONTENT_DATES` in the merge commit.
- **The predictor's metadata** names the half: "Marathon Time Predictor from a Half, 10K or 5K | Pace Notes" and "A marathon range from a recent half, 10K or 5K, from published formulas, beside the marathons that followed the same half time." No title or description counts half finishes or pairs (`finish-counts` allows only the marathon's `finishesM()`), and none says "fastest".
- **`/stories`** counts its stories from the list ("Eleven stories, one finding each."), and its description now says "most from 4.1 million recorded marathon finishes", because the half story is not a marathon-finish story; `verify-seo` `hub-counts` checks the count line against the list.
- **Checks** (October 30, 2026, on a plain build): `verify-seo` passed all 24 checks (the two older description-length warnings, `/tools/plan` and `/tools/pace-band`, unchanged); `methods-anchors` found every `/methodology#half-*` id the half pages link (`half-data`, `half-coverage`, `half-linking`, `half-multiple`, `half-field`, `story-half-to-full`, `half-cards`, `downloads-half`), and `orphans` found both pages linked (in the export, the home guide, `/research`, `/about`, `/finish-times`, `/methodology` and the half pace chart link `/half`; chapter 11's rows in the contents and the chapters menu, `/half`'s night card and `/stories` link the story).

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
| `/half` | `og/pages/half.png` | "Half marathon · Finish times", "The half marathon". The half story's card is the usual `og/stories/half-to-full.png`, made only when the story is published (`storyPublished`) |
| `/stories`, `/tools`, `/courses` | `og/sections/<section>.png` | the section's own line |
| `/analyses` and every analysis page | `og/sections/analyses.png` | |
| `/packs` and every pack page | `og/sections/packs.png` (the research archive) | |
| everything else (home, about, methodology, slowdown, …) | `og/default.png` | |

If a page has no card yet, it falls back to the parent tool's card, then the section card, then the default, so a page never points at a missing file. `verify-seo` warns when a page uses a less specific card than the one the script makes for it: it reads the script's card list (`plannedCards()` in `scripts/build-og-images.cjs`, no browser needed), so a new goal page, race or story is expected to have its own card as soon as its list includes it. A goal time on a card ("4:00 marathon pace") is the page's name, not a data number.

**Rules for the cards:** words only (the brand, a section label, the title or race name, and "by Andrew Kam"); no data numbers, because they would go stale; no runner names; 1200×630; at most 120 KB each (63 cards, 32–81 KB, 3.2 MB in all on October 8, 2026). The race name follows the course page's rule: the supplied route's race name, else the course summary's, else the city plus " Marathon". "Washington Marathon" is shown as the data names it; if the owner renames that race, re-run the script.

**Making them.** [`scripts/build-og-images.cjs`](../scripts/build-og-images.cjs) renders the cards with Playwright and headless Chromium from an HTML template in the default card's design: the site's fonts from `node_modules/@fontsource-variable`, the night background and accents from `app/styles/tokens.css` (`checkTokens()` stops the script if those tokens change; update `TOKENS` in the script with them), and each story's or tool's accent colour. It loads `playwright` from `node_modules` (a devDependency, for the browser privacy checks), else `/opt/node-tools/node_modules/playwright`; `npx playwright install chromium` installs the browser. No CI job runs `npm run og:check`: run it after a change to the tokens, the fonts, a registry name or a title.

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
| `moved-links` | a page links a moved address instead of its target (the redesign's pending-link list was emptied and removed at integration, October 18, 2026; a weather tab named in a target's hash counts as an anchor through its `data-tab`) |
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
| `hub-counts` | a hub whose line counts its pages ("Ten stories, one finding each.") lists a different number, or its meta description and `og:description` do not open on the same count word (WP9 round 6, October 20, 2026) |
| `title-brand` | a title without "Pace Notes" would still fit 60 characters with " \| Pace Notes", or a title names the brand twice: every title ends the same way unless the suffix would pass the limit or the title opens on the brand (release preparation, October 20, 2026; the course pages' `courseTitle()` follows the same rule) |
| `home-form` | the home page's course select (`#home-plan-course`) does not have the planner's options (`#plan-course` on `/tools/plan`), the same values and names in the same order: the home list comes from the course pages, the planner's from its own data (October 16, 2026) |
| `methods-anchors` | a `/methodology#<id>` link (in the exported HTML, or as a literal in `app/`, `components/` or `lib/`), or a `#<id>` link on `/methodology`, names an id `/methodology` does not have |

Warnings only: titles over 60 characters (`title-length`) and descriptions over 155 (`description-length`), the site's limits; `og-image-fallback` (a page that uses a less specific card than the one `scripts/build-og-images.cjs` makes for it: a stale build or a missing card); and policy notes (noindex pages that also say nofollow, JSON-LD on pages the plan keeps without it, `changefreq` or `priority` in the sitemap).

## Moved addresses (October 18, 2026)

The redesign (merged October 20, 2026) closed the research archive (`/packs` and its 84 question pages), the archived personalized guide (`/research/personalized`) and the two weather-question pages (now tabs of race-day weather). Each old address is listed in `lib/seo-routes.ts`: `movedTo(path)` says where it went and `movedPages()` lists every address that keeps a stub. The courses that left the data (`/courses/melbourne`, `/courses/vienna`) 308 to `/courses` without a stub, and the `/design-system` gallery was deleted with no address and no redirect (it was never public). The record of the export at release preparation is in [history](history/seo-2026-10.md).

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

## Redirects and headers (`vercel.json`)

Next.js `redirects()` and `headers()` do not work with `output: 'export'`, so these live in [`vercel.json`](../vercel.json):

| Rule | Effect |
| --- | --- |
| Host `htw-live-study.vercel.app`, any path | 308 to `https://splithappens.run/<same path>` |
| `/htw` | 308 to `/slowdown` |
| `/packs/smyth_htw` | 308 to `/slowdown` |
| `/tools/marathon-pace` | 308 to `/tools/marathon-pace-chart` (the goal pages sit below this path, which has no page of its own) |
| `/courses/melbourne` | 308 to `/courses` (October 17, 2026: Melbourne's only edition is excluded in release 1652, so the page is not built) |
| `/courses/vienna` | 308 to `/courses` (October 21, 2026: Vienna has no eligible edition in release 1050, so the page is not built) |
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
